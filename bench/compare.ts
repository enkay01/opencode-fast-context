import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { mean, median, percentile } from "./metrics.ts";

interface RecordLike {
  elapsedMs: number;
  metrics: {
    top1Correct: boolean | null;
    recallAt5: number | null;
    lineCoverage: number | null;
    absentCorrect: boolean | null;
    validCompletion: boolean;
  };
}

async function load(dir: string) {
  const base = resolve(dir);
  const manifest = JSON.parse(await readFile(join(base, "manifest.json"), "utf8"));
  const records = JSON.parse(await readFile(join(base, "records.json"), "utf8")) as RecordLike[];
  return { manifest, records, dir: base };
}

function summarise(run: Awaited<ReturnType<typeof load>>) {
  const times = run.records.map((record) => record.elapsedMs);
  const code = run.records.filter((record) => record.metrics.recallAt5 !== null);
  const absent = run.records.filter((record) => record.metrics.absentCorrect !== null);
  return {
    arm: String(run.manifest.arm),
    n: run.records.length,
    median: median(times),
    p95: percentile(times, 95),
    top1: code.length === 0 ? null : code.filter((record) => record.metrics.top1Correct).length / code.length,
    recall: mean(code.map((record) => record.metrics.recallAt5)),
    coverage: mean(code.map((record) => record.metrics.lineCoverage)),
    absentCorrect: absent.filter((record) => record.metrics.absentCorrect).length,
    absentTotal: absent.length,
    valid: mean(run.records.map((record) => (record.metrics.validCompletion ? 1 : 0))),
  };
}

async function main(): Promise<void> {
  const dirs = process.argv.slice(2);
  if (dirs.length < 2) throw new Error("usage: node bench/compare.ts <baseline-run> <candidate-run> [...]");
  const runs = await Promise.all(dirs.map(load));
  const summaries = runs.map(summarise);
  const baseline = summaries[0]!;

  const rows = summaries.map((summary, index) => {
    const delta =
      index === 0 || summary.median === null || baseline.median === null
        ? ""
        : `${(((summary.median - baseline.median) / baseline.median) * 100).toFixed(1)}%`;
    return [
      summary.arm,
      summary.n,
      `${summary.median ?? "n/a"}`,
      `${summary.p95 ?? "n/a"}`,
      index === 0 ? "—" : delta,
      formatPct(summary.top1),
      summary.recall === null ? "n/a" : summary.recall.toFixed(2),
      summary.coverage === null ? "n/a" : summary.coverage.toFixed(2),
      summary.absentTotal === 0 ? "n/a" : `${summary.absentCorrect}/${summary.absentTotal}`,
      formatPct(summary.valid),
    ].join(" | ");
  });

  console.log("| Arm | Runs | Median ms | p95 ms | Δ median | Top-1 | Recall@5 | Line coverage | Absent correct | Valid |");
  console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const row of rows) console.log(`| ${row} |`);
  console.log("");
  for (const run of runs) console.log(`- ${run.dir}`);
}

function formatPct(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(0)}%`;
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
