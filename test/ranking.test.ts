import assert from "node:assert/strict";
import { test } from "node:test";
import { searchRepository } from "../src/engine/search.ts";
import type { DecisionProvider } from "../src/providers/types.ts";
import type { DiscoveryResult } from "../src/engine/discover.ts";
import { makeFixture } from "./fixture.ts";

const REPO = {
  "src/a.ts": "export function retryDelay(attempt: number) {\n  return attempt * 100\n}\n",
  "src/b.ts": "export function retryDelayLabel() {\n  return 'retry delay'\n}\n",
  "src/c.ts": "export const retryDelayDocs = true\n",
  "src/d.ts": "export const other = 1\n",
};

function stubProvider(score: (path: string) => number): DecisionProvider {
  return {
    id: "jev",
    model: "stub-1",
    async score(_query, candidates) {
      const scores: Record<string, number> = {};
      for (const candidate of candidates) scores[candidate.id] = score(candidate.path);
      return { scores, usage: { input: 10, output: 2 }, model: "stub-1", skipped: 0 };
    },
  };
}

test("decision scores reorder the lexical shortlist", async () => {
  const fixture = await makeFixture(REPO);
  try {
    const result = await searchRepository({
      root: fixture.root,
      query: "Where is retryDelay computed?",
      provider: stubProvider((path) => (path === "src/c.ts" ? 0.95 : 0.1)),
    });
    assert.equal(result.status, "complete");
    assert.equal(result.results[0]?.path, "src/c.ts");
    assert.equal(result.results[0]?.scores.decision, 0.95);
    assert.deepEqual(result.provider, { id: "jev", model: "stub-1", usage: { input: 10, output: 2 } });
  } finally {
    await fixture.cleanup();
  }
});

test("provider failure returns fallback_required with lexical evidence and a reason", async () => {
  const fixture = await makeFixture(REPO);
  try {
    const provider: DecisionProvider = {
      id: "clef",
      model: "stub",
      async score() {
        throw new Error("HTTP 503: unavailable");
      },
    };
    const result = await searchRepository({
      root: fixture.root,
      query: "Where is retryDelay computed?",
      provider,
    });
    assert.equal(result.status, "fallback_required");
    assert.match(result.reason ?? "", /503/);
    assert.ok(result.results.length > 0, "keeps lexical evidence for the caller");
    assert.ok(result.searched.candidates > 0, "scope survives a later provider failure");
    assert.ok(result.searched.files > 0);
  } finally {
    await fixture.cleanup();
  }
});

test("a provider that returns no scores does not crash the search", async () => {
  const fixture = await makeFixture(REPO);
  try {
    const provider: DecisionProvider = {
      id: "jev",
      model: "stub",
      async score() {
        return { scores: {}, usage: null, model: "stub", skipped: 4 };
      },
    };
    const result = await searchRepository({
      root: fixture.root,
      query: "Where is retryDelay computed?",
      provider,
    });
    assert.equal(result.status, "partial");
    assert.ok(result.results.length > 0);
    assert.ok(result.searched.candidates > 0);
  } finally {
    await fixture.cleanup();
  }
});

test("low relevance judgments return no_match instead of weak results", async () => {
  const fixture = await makeFixture(REPO);
  try {
    const result = await searchRepository({
      root: fixture.root,
      query: "Where is retryDelay computed?",
      provider: stubProvider(() => 0.02),
    });
    assert.equal(result.status, "no_match");
    assert.equal(result.results.length, 0);
    assert.ok(result.searched.candidates > 0, "no_match reports what was searched");
    assert.match(result.reason ?? "", /threshold/);
  } finally {
    await fixture.cleanup();
  }
});

test("a timed-out discovery with scored candidates is partial, not no_match", async () => {
  const fixture = await makeFixture(REPO);
  try {
    const candidate = {
      id: "src/a.ts#1-3",
      path: "src/a.ts",
      ranges: [{ start: 1, end: 3 }],
      excerpt: "retryDelay",
      matchLines: [1],
      lexicalScore: 1,
    };
    const discovery: DiscoveryResult = {
      candidates: [candidate],
      matchedFiles: 1,
      fileCount: 1,
      waves: 2,
      timedOut: true,
    };
    const result = await searchRepository({
      root: fixture.root,
      query: "retryDelay",
      provider: stubProvider(() => 0.01),
      discoverImpl: async () => discovery,
    });
    assert.equal(result.status, "partial");
    assert.equal(result.searched.candidates, 1);
    assert.equal(result.searched.truncated, true);
    assert.match(result.reason ?? "", /deadline/);
  } finally {
    await fixture.cleanup();
  }
});

test("searched counts only candidate windows sent to the provider", async () => {
  const files: Record<string, string> = {};
  for (let index = 0; index < 30; index += 1) files[`src/f${index}.ts`] = `export const retryDelay${index} = ${index}\n`;
  const fixture = await makeFixture(files);
  try {
    let received = 0;
    const provider: DecisionProvider = {
      id: "jev",
      model: "stub",
      async score(_query, candidates) {
        received = candidates.length;
        return {
          scores: Object.fromEntries(candidates.map((candidate) => [candidate.id, 0.9])),
          usage: null,
          model: "stub",
          skipped: 0,
        };
      },
    };
    const discovery: DiscoveryResult = {
      candidates: Object.keys(files).map((path, index) => ({
        id: `${path}#1-1`,
        path,
        ranges: [{ start: 1, end: 1 }],
        excerpt: `retryDelay${index}`,
        matchLines: [1],
        lexicalScore: 10 - index * 0.01,
      })),
      matchedFiles: 30,
      fileCount: 30,
      waves: 1,
      timedOut: false,
    };
    const result = await searchRepository({
      root: fixture.root,
      query: "retryDelay",
      provider,
      discoverImpl: async () => discovery,
    });
    assert.equal(received, 24);
    assert.equal(result.searched.candidates, 24);
    assert.equal(result.searched.files, 24);
  } finally {
    await fixture.cleanup();
  }
});

test("filtered-out candidates preserve fallback_required instead of no_match", async () => {
  const fixture = await makeFixture({
    "src/secret.ts": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n",
  });
  try {
    const candidate = {
      id: "src/secret.ts#1-3",
      path: "src/secret.ts",
      ranges: [{ start: 1, end: 3 }],
      excerpt: "private key",
      matchLines: [1],
      lexicalScore: 1,
    };
    const result = await searchRepository({
      root: fixture.root,
      query: "private key",
      provider: stubProvider(() => 0.9),
      discoverImpl: async () => ({
        candidates: [candidate],
        matchedFiles: 1,
        fileCount: 1,
        waves: 1,
        timedOut: false,
      }),
    });
    assert.equal(result.status, "fallback_required");
    assert.equal(result.searched.candidates, 0);
    assert.match(result.reason ?? "", /no sendable candidates/);
  } finally {
    await fixture.cleanup();
  }
});

test("filtered-out candidates after a timeout return partial", async () => {
  const fixture = await makeFixture({
    "src/secret.ts": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n",
  });
  try {
    const candidate = {
      id: "src/secret.ts#1-3",
      path: "src/secret.ts",
      ranges: [{ start: 1, end: 3 }],
      excerpt: "private key",
      matchLines: [1],
      lexicalScore: 1,
    };
    const result = await searchRepository({
      root: fixture.root,
      query: "private key",
      provider: stubProvider(() => 0.9),
      discoverImpl: async () => ({
        candidates: [candidate],
        matchedFiles: 1,
        fileCount: 1,
        waves: 2,
        timedOut: true,
      }),
    });
    assert.equal(result.status, "partial");
    assert.equal(result.searched.truncated, true);
  } finally {
    await fixture.cleanup();
  }
});

test("a candidate whose file disappears preserves fallback_required", async () => {
  const fixture = await makeFixture({ "src/a.ts": "export const a = 1\n" });
  try {
    const result = await searchRepository({
      root: fixture.root,
      query: "missing",
      provider: stubProvider(() => 0.9),
      discoverImpl: async () => ({
        candidates: [
          {
            id: "src/missing.ts#1-1",
            path: "src/missing.ts",
            ranges: [{ start: 1, end: 1 }],
            excerpt: "missing",
            matchLines: [1],
            lexicalScore: 1,
          },
        ],
        matchedFiles: 1,
        fileCount: 1,
        waves: 1,
        timedOut: false,
      }),
    });
    assert.equal(result.status, "fallback_required");
    assert.equal(result.searched.candidates, 0);
  } finally {
    await fixture.cleanup();
  }
});
