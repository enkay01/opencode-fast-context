import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { searchRepository } from "../src/engine/search.ts";
import { formatForModel } from "../src/tool.ts";
import { makeFixture, addSymlink } from "./fixture.ts";

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
    assert.equal(first.digest.length, 64);
    assert.ok(first.ranges[0]!.start >= 1);
    assert.match(first.excerpt, /retryDelay/);
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

test("never returns a secret file even when it matches the query", async () => {
  const fixture = await makeFixture({
    ...REPO,
    ".env.local": "RETRY_DELAY_SECRET=abc123\n",
    "config/credentials.json": '{"retryDelay":"secret"}',
  });
  try {
    const result = await searchRepository({ root: fixture.root, query: "Where is retryDelay set?" });
    const paths = result.results.map((item) => item.path);
    assert.ok(!paths.includes(".env.local"));
    assert.ok(!paths.includes("config/credentials.json"));
  } finally {
    await fixture.cleanup();
  }
});

test("rejects a symlink that resolves outside the worktree", async () => {
  const outside = await makeFixture({
    "secret.ts": "export const retryDelay = () => 999\n",
  });
  const fixture = await makeFixture({
    "src/retry.ts": "export const unrelated = 1\n",
  });
  try {
    await addSymlink(fixture.root, "src/linked.ts", join(outside.root, "secret.ts"));
    const result = await searchRepository({ root: fixture.root, query: "Where is retryDelay computed?" });
    assert.ok(!result.results.some((item) => item.path === "src/linked.ts"));
  } finally {
    await fixture.cleanup();
    await outside.cleanup();
  }
});

test("respects maxFiles and reports truncation", async () => {
  const fixture = await makeFixture(REPO);
  try {
    const result = await searchRepository({ root: fixture.root, query: "retryDelay", maxFiles: 1 });
    assert.ok(result.results.length <= 1);
    assert.equal(result.truncated, true);
  } finally {
    await fixture.cleanup();
  }
});

test("keeps the model-facing view compact", async () => {
  const fixture = await makeFixture(REPO);
  try {
    const result = await searchRepository({ root: fixture.root, query: "Where is retryDelay computed?" });
    const text = formatForModel(result);
    assert.match(text, /status: complete/);
    assert.match(text, /src\/retry\.ts:\d+-\d+/);
    assert.ok(text.length < 2000, "tool output should stay small");
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
      limits: { deadlineMs: 1 },
    });
    assert.equal(result.status, "fallback_required");
    assert.match(result.reason ?? "", /discovery deadline/);
    assert.equal(result.searched.truncated, true);
  } finally {
    await fixture.cleanup();
  }
});
