import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreRun } from "../bench/metrics.ts";
import type { SearchResult } from "../src/types.ts";

const result = (paths: string[]): SearchResult => ({
  version: 1,
  query: "q",
  status: paths.length > 0 ? "complete" : "no_match",
  results: paths.map((path) => ({
    path,
    ranges: [{ start: 1, end: 2 }],
    digest: "",
    excerpt: "",
    scores: { lexical: 0, decision: null },
  })),
  truncated: false,
  candidateCount: paths.length,
  provider: { id: "none", model: null, usage: null },
  timings: { discovery: 0, ranking: 0, total: 0 },
});

const task = (absent = false) => ({
  id: "t",
  repo: "r",
  split: "validation" as const,
  question: "q",
  labels: absent ? [] : [{ path: "a.ts", ranges: [{ start: 1, end: 2 }] }],
  ...(absent ? { absent: true } : {}),
});

test("precision@5 uses a fixed denominator of five", () => {
  const metrics = scoreRun(task(), result(["a.ts"]), 10);
  assert.equal(metrics.precisionAt5, 0.2);
  assert.equal(metrics.recallAt5, 1);
});

test("one relevant file among five scores 0.2, not 1.0", () => {
  const metrics = scoreRun(task(), result(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]), 10);
  assert.equal(metrics.precisionAt5, 0.2);
});

test("a failed run is never a valid absent answer", () => {
  const metrics = scoreRun(task(true), result([]), 10, { failed: true, noAnswer: false });
  assert.equal(metrics.validCompletion, false);
  assert.equal(metrics.absentCorrect, false);
});

test("an empty answer without NO_ANSWER is a malformed run", () => {
  const metrics = scoreRun(task(true), result([]), 10, { malformed: true, noAnswer: false });
  assert.equal(metrics.validCompletion, false);
  assert.equal(metrics.absentCorrect, false);
});

test("an explicit NO_ANSWER is a correct absent answer", () => {
  const metrics = scoreRun(task(true), result([]), 10, { noAnswer: true });
  assert.equal(metrics.validCompletion, true);
  assert.equal(metrics.absentCorrect, true);
});

test("citations returned for an absent task are a wrong answer, not a failure", () => {
  const metrics = scoreRun(task(true), result(["a.ts"]), 10, { noAnswer: false });
  assert.equal(metrics.validCompletion, true);
  assert.equal(metrics.absentCorrect, false);
});

test("the retrieval engine's no_match counts as a correct absent answer", () => {
  const metrics = scoreRun(task(true), result([]), 10);
  assert.equal(metrics.validCompletion, true);
  assert.equal(metrics.absentCorrect, true);
});

test("returned citations for an absent task are not a correct answer", () => {
  const metrics = scoreRun(task(true), result(["a.ts"]), 10);
  assert.equal(metrics.absentCorrect, false);
});
