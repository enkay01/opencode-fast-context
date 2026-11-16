import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReport } from "../bench/report.ts";

test("benchmark report includes request failures and paid input estimate without dropping failed runs", () => {
  const metrics = { status: "complete", validCompletion: true, filesReturned: 1, invalidCitations: 0,
    precisionAt5: 0.2, recallAt5: 1, top1Correct: true, reciprocalRank: 1, lineCoverage: 1,
    absentCorrect: null, contextChars: 80 };
  const result = { truncated: false, provider: { id: "gemini", model: "gemini-decision-1", usage: { input: 100, output: 0 } }, timings: { discovery: 2, ranking: 10 } };
  const rows = [
    { taskId: "present", arm: "gemini", repeat: 0, elapsedMs: 20, metrics, result,
      providerRequests: [{ elapsedMs: 8, status: 200 }], estimatedPaidUsd: 0.00001 },
    { taskId: "blocked", arm: "gemini", repeat: 0, elapsedMs: 30,
      metrics: { ...metrics, status: "fallback_required", validCompletion: false },
      result: { ...result, reason: "HTTP 429" },
      providerRequests: [{ elapsedMs: 12, status: 429 }], estimatedPaidUsd: null },
  ];
  const report = buildReport({ arm: "Gemini", provider: "gemini", repeat: 1 }, rows);
  assert.match(report, /\| Runs \| 2 \|/);
  assert.match(report, /\| Valid completion \| 50\.0% \|/);
  assert.match(report, /\| Provider calls \| 2 \|/);
  assert.match(report, /\| Provider 429 responses \| 1 \|/);
  assert.match(report, /\| Estimated Gemini paid input cost \| \$0\.000010 \|/);
});
