import assert from "node:assert/strict";
import { test } from "node:test";
import { searchRepository } from "../src/engine/search.ts";
import type { DecisionProvider } from "../src/providers/types.ts";
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
  } finally {
    await fixture.cleanup();
  }
});
