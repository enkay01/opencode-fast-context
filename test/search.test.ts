import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { join, relative } from "node:path";
import { searchRepository } from "../src/engine/search.ts";
import { discover, readCandidateExcerpt, type Candidate } from "../src/engine/discover.ts";
import { exec } from "../src/engine/files.ts";
import { formatForModel } from "../src/tool.ts";
import { DEFAULT_LIMITS } from "../src/types.ts";
import { makeFixture, addSymlink } from "./fixture.ts";

function candidateAt(path: string): Candidate {
  return {
    id: "c1",
    path,
    ranges: [{ start: 1, end: 1 }],
    excerpt: "",
    matchLines: [1],
    lexicalScore: 1,
  };
}

const REPO = {
  "src/retry.ts": [
    "export function retryDelay(attempt: number): number {",
    "  const backoff = Math.min(2 ** attempt, 30) * 1000",
    "  return backoff",
    "}",
    "",
  ].join("\n"),
  "src/other.ts": [
    "export function unrelated(value: string): string {",
    "  return value.toUpperCase()",
    "}",
    "",
  ].join("\n"),
  "docs/retry.md": "Retry delay is documented here.\n",
};

test("finds a function by identifier and returns valid ranges with a digest", async () => {
  const fixture = await makeFixture(REPO);
  try {
    const result = await searchRepository({
      root: fixture.root,
      query: "Where is retryDelay computed?",
    });
    assert.equal(result.status, "complete");
    const first = result.results[0];
    assert.ok(first, "expected evidence");
    assert.equal(first.path, "src/retry.ts");
    assert.equal(first.digest, createHash("sha256").update(REPO["src/retry.ts"]).digest("hex"));
    assert.ok(first.ranges.some(({ start, end }) => start === 1 && end >= 3 && end <= 5));
    assert.match(first.excerpt, /retryDelay/);
    assert.match(first.excerpt, /return backoff/);
    assert.equal(result.provider.id, "none");
    assert.equal(result.searched.candidates, 0, "no provider means no windows scored");
    assert.equal(result.searched.files, 0);
    assert.equal(result.searched.truncated, false);
  } finally {
    await fixture.cleanup();
  }
});

test("returns no_match for an absent behavior instead of inventing a file", async () => {
  const fixture = await makeFixture(REPO);
  try {
    const result = await searchRepository({
      root: fixture.root,
      query: "Where is the persistent vector index rebuilt?",
    });
    assert.equal(result.status, "no_match");
    assert.equal(result.results.length, 0);
    assert.equal(result.searched.candidates, 0);
    assert.equal(result.searched.truncated, false);
  } finally {
    await fixture.cleanup();
  }
});

test("re-reading a candidate rejects a symlink outside the worktree", async (t) => {
  const outside = await makeFixture({
    "secret.ts": "export const retryDelay = () => 999\n",
  });
  const fixture = await makeFixture({
    "src/retry.ts": "export const unrelated = 1\n",
  });
  try {
    const linked = await addSymlink(fixture.root, "src/linked.ts", join(outside.root, "secret.ts"));
    if (!linked) {
      t.skip("symlink creation is not permitted on this platform");
      return;
    }
    const checked = await readCandidateExcerpt(fixture.root, candidateAt("src/linked.ts"), 1_000_000);
    assert.equal(checked, null);
  } finally {
    await fixture.cleanup();
    await outside.cleanup();
  }
});

test("re-reads reject a path that resolves outside the worktree", async () => {
  const outside = await makeFixture({
    "secret.ts": "export const retryDelay = 999\n",
  });
  const fixture = await makeFixture({
    "src/retry.ts": "export const retryDelay = 1\n",
  });
  try {
    const escaping = relative(fixture.root, join(outside.root, "secret.ts"));
    const checked = await readCandidateExcerpt(fixture.root, candidateAt(escaping), 1_000_000);
    assert.equal(checked, null);
  } finally {
    await fixture.cleanup();
    await outside.cleanup();
  }
});

test("respects maxFiles and reports truncation", async () => {
  const fixture = await makeFixture({
    "src/a.ts": "export const retryDelayA = 1\n",
    "src/b.ts": "export const retryDelayB = 2\n",
  });
  try {
    const uncapped = await searchRepository({ root: fixture.root, query: "retryDelay" });
    const result = await searchRepository({ root: fixture.root, query: "retryDelay", maxFiles: 1 });
    assert.deepEqual(uncapped.results.map(({ path }) => path).sort(), ["src/a.ts", "src/b.ts"]);
    assert.deepEqual(result.results, uncapped.results.slice(0, 1));
    assert.equal(result.truncated, true);
  } finally {
    await fixture.cleanup();
  }
});

test("a discovery timeout reports fallback_required rather than no_match", async () => {
  const fixture = await makeFixture(REPO);
  try {
    const result = await searchRepository({
      root: fixture.root,
      query: "Where is retryDelay computed?",
      discoverImpl: (root, query, limits, options) => discover(root, query, limits, {
        ...options,
        execImpl: async () => ({ code: null, stdout: "", stderr: "", timedOut: true }),
      }),
    });
    assert.equal(result.status, "fallback_required");
    assert.match(result.reason ?? "", /discovery deadline/);
    assert.equal(result.searched.truncated, true);
    assert.match(formatForModel(result), /discovery truncated by deadline/);
  } finally {
    await fixture.cleanup();
  }
});

test("discover spawns at most one rg process per wave even for multi-token queries", async () => {
  const fixture = await makeFixture(REPO);
  try {
    const calls: { command: string; args: string[] }[] = [];
    const result = await discover(
      fixture.root,
      "verify fingerprint access walk register provenance diff truncation check command in retryDelay",
      DEFAULT_LIMITS,
      {
        execImpl: async (command, args, opts) => {
          calls.push({ command, args });
          return exec(command, args, opts);
        },
      },
    );
    assert.ok(result.candidates.length > 0, "expected candidates from combined rg pass");
    assert.ok(calls.every(({ command }) => command === "rg"));
    assert.ok(calls[0]!.args.filter((arg) => arg === "-e").length > 1);
    assert.equal(calls.length, result.waves, "expected exactly 1 rg process per wave");
    assert.ok(calls.length <= DEFAULT_LIMITS.waves);
  } finally {
    await fixture.cleanup();
  }
});

test("default limits apply a 30s deadline to Jev ranking and leave discovery unbounded", async (t) => {
  const fixture = await makeFixture(REPO);
  const now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  try {
    let rankingDeadline: number | undefined;
    let discoveryDeadline: number | undefined;
    const result = await searchRepository({
      root: fixture.root,
      query: "Where is retryDelay computed?",
      discoverImpl: (root, query, limits, options) => {
        discoveryDeadline = options.deadline;
        return discover(root, query, limits, options);
      },
      provider: {
        id: "jev",
        model: "jev-latest",
        async score(_query, candidates, options) {
          rankingDeadline = options.deadline;
          return {
            scores: Object.fromEntries(candidates.map((c) => [c.id, 0.9])),
            usage: null,
            model: "jev-latest",
            skipped: 0,
          };
        },
      },
    });
    assert.equal(result.status, "complete");
    assert.equal(discoveryDeadline, undefined);
    assert.equal(rankingDeadline, now + 30_000);
  } finally {
    await fixture.cleanup();
  }
});
