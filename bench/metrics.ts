import type { EvidenceRange, SearchResult } from "../src/types.ts";
import type { Task } from "./corpus.ts";

export interface Metrics {
  status: string;
  validCompletion: boolean;
  filesReturned: number;
  precisionAt5: number | null;
  recallAt5: number | null;
  top1Correct: boolean | null;
  reciprocalRank: number | null;
  lineCoverage: number | null;
  absentCorrect: boolean | null;
  elapsedMs: number;
  contextChars: number;
}

export function scoreRun(task: Task, result: SearchResult, elapsedMs: number): Metrics {
  const top5 = result.results.slice(0, 5);
  const labelPaths = new Set(task.labels.map((label) => label.path));
  const contextChars = result.results.reduce((sum, evidence) => sum + evidence.excerpt.length, 0);

  if (task.absent) {
    return {
      status: result.status,
      validCompletion: result.status === "complete" || result.status === "no_match",
      filesReturned: result.results.length,
      precisionAt5: null,
      recallAt5: null,
      top1Correct: null,
      reciprocalRank: null,
      lineCoverage: null,
      absentCorrect: result.results.length === 0,
      elapsedMs,
      contextChars,
    };
  }

  const relevant = top5.filter((evidence) => labelPaths.has(evidence.path)).length;
  const precisionAt5 = top5.length === 0 ? 0 : relevant / top5.length;
  const hitPaths = new Set(top5.filter((evidence) => labelPaths.has(evidence.path)).map((evidence) => evidence.path));
  const recallAt5 = labelPaths.size === 0 ? null : hitPaths.size / labelPaths.size;

  let covered = 0;
  let total = 0;
  for (const label of task.labels) {
    const evidence = top5.find((item) => item.path === label.path);
    for (const range of label.ranges) {
      total += range.end - range.start + 1;
      if (!evidence) continue;
      covered += overlapLength(range, evidence.ranges);
    }
  }
  const lineCoverage = total === 0 ? null : Math.min(1, covered / total);
  const firstHit = result.results.findIndex((evidence) => labelPaths.has(evidence.path));
  const top1Correct = result.results.length > 0 ? labelPaths.has(result.results[0]!.path) : false;
  const reciprocalRank = firstHit === -1 ? 0 : round(1 / (firstHit + 1));

  return {
    status: result.status,
    validCompletion: ["complete", "partial", "no_match"].includes(result.status),
    filesReturned: result.results.length,
    precisionAt5: round(precisionAt5),
    recallAt5: recallAt5 === null ? null : round(recallAt5),
    top1Correct,
    reciprocalRank,
    lineCoverage: lineCoverage === null ? null : round(lineCoverage),
    absentCorrect: null,
    elapsedMs,
    contextChars,
  };
}

function overlapLength(label: EvidenceRange, ranges: EvidenceRange[]): number {
  let count = 0;
  for (const range of ranges) {
    const start = Math.max(label.start, range.start);
    const end = Math.min(label.end, range.end);
    if (end >= start) count += end - start + 1;
  }
  return Math.min(count, label.end - label.start + 1);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index]!;
}

export function mean(values: (number | null)[]): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  if (numbers.length === 0) return null;
  return round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}
