import { mean, median, percentile } from "./metrics.ts";

interface RecordLike {
  taskId: string;
  arm: string;
  repeat: number;
  elapsedMs: number;
  metrics: {
    status: string;
    validCompletion: boolean;
    filesReturned: number;
    precisionAt5: number | null;
    recallAt5: number | null;
    top1Correct: boolean | null;
    reciprocalRank: number | null;
    lineCoverage: number | null;
    absentCorrect: boolean | null;
    contextChars: number;
  };
  result: {
    truncated: boolean;
    reason?: string;
    provider: { id: string; model: string | null; usage: { input: number; output: number } | null };
    timings: { discovery: number; ranking: number };
  };
}

export function buildReport(manifest: Record<string, unknown>, records: RecordLike[]): string {
  const elapsed = records.map((record) => record.elapsedMs);
  const usage = records.reduce(
    (total, record) => {
      const item = record.result.provider.usage;
      if (!item) return total;
      return { input: total.input + item.input, output: total.output + item.output, seen: true };
    },
    { input: 0, output: 0, seen: false },
  );

  const lines: string[] = [];
  lines.push(`# Retrieval benchmark: ${String(manifest.arm ?? "unknown arm")}`);
  lines.push("");
  lines.push(`- Provider: \`${String(manifest.provider ?? "none")}\` (${String(manifest.providerModel ?? "n/a")})`);
  lines.push(`- Tasks: ${String((manifest.tasks as string[] | undefined)?.length ?? records.length)}`);
  lines.push(`- Repetitions: ${String(manifest.repeat ?? 1)}`);
  lines.push(`- Corpus: \`${String(manifest.corpus ?? "bench/corpus/tasks.json")}\``);
  lines.push(`- Node: ${String(manifest.node ?? process.version)}`);
  lines.push("");
  lines.push("## Per task");
  lines.push("");
  lines.push("| Task | Status | Time (ms) | Top-1 | MRR | P@5 | R@5 | Line coverage | Files | Note |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const record of records) {
    const m = record.metrics;
    const note = record.result.reason ? record.result.reason.slice(0, 90) : "";
    lines.push(
      `| ${record.taskId} | ${m.status} | ${record.elapsedMs} | ${m.top1Correct === null ? "n/a" : m.top1Correct ? "yes" : "no"} | ` +
        `${value(m.reciprocalRank)} | ${value(m.precisionAt5)} | ${value(m.recallAt5)} | ${value(m.lineCoverage)} | ` +
        `${m.filesReturned} | ${escapeCell(note)} |`,
    );
  }
  lines.push("");
  lines.push("## Aggregate");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | ---: |");
  lines.push(`| Runs | ${records.length} |`);
  lines.push(`| Valid completion | ${pct(records.filter((record) => record.metrics.validCompletion).length / records.length)} |`);
  lines.push(`| Median time | ${median(elapsed) ?? "n/a"} ms |`);
  lines.push(`| p95 time | ${percentile(elapsed, 95) ?? "n/a"} ms |`);
  lines.push(
    `| Top-1 accuracy | ${pct(
      records.filter((record) => record.metrics.top1Correct === true).length /
        Math.max(1, records.filter((record) => record.metrics.top1Correct !== null).length),
    )} |`,
  );
  lines.push(`| Macro reciprocal rank | ${value(mean(records.map((record) => record.metrics.reciprocalRank)))} |`);
  lines.push(`| Macro precision@5 | ${value(mean(records.map((record) => record.metrics.precisionAt5)))} |`);
  lines.push(`| Macro recall@5 | ${value(mean(records.map((record) => record.metrics.recallAt5)))} |`);
  lines.push(`| Macro line coverage | ${value(mean(records.map((record) => record.metrics.lineCoverage)))} |`);
  lines.push(`| Absent-answer correct | ${absentSummary(records)} |`);
  lines.push(`| Truncated results | ${records.filter((record) => record.result.truncated).length} |`);
  lines.push(`| Fallback required | ${records.filter((record) => record.result.status === "fallback_required").length} |`);
  lines.push(
    `| Provider usage | ${usage.seen ? `${usage.input} input / ${usage.output} output tokens` : "unavailable"} |`,
  );
  lines.push(
    `| Mean discovery / ranking | ${Math.round(mean(records.map((record) => record.result.timings.discovery)) ?? 0)} ms / ` +
      `${Math.round(mean(records.map((record) => record.result.timings.ranking)) ?? 0)} ms |`,
  );
  lines.push("");
  lines.push("## Targets");
  lines.push("");
  lines.push(
    "Project targets: at least 25% lower median time than the stock DeepSeek baseline, no more than two " +
      "percentage points lower macro recall@5, no worse p95, and at least 95% valid completion. These are " +
      "engineering targets, not results. Compare them only with a B0 run on the same corpus, revisions, and host.",
  );
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function absentSummary(records: RecordLike[]): string {
  const answered = records.filter((record) => record.metrics.absentCorrect !== null);
  if (answered.length === 0) return "n/a";
  const correct = answered.filter((record) => record.metrics.absentCorrect).length;
  return `${correct}/${answered.length}`;
}

function value(input: number | null): string {
  return input === null ? "n/a" : input.toFixed(3);
}

function pct(input: number): string {
  return `${(input * 100).toFixed(1)}%`;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
