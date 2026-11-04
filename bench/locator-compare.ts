import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { searchRepository } from "../src/engine/search.ts";
import { createJevProvider } from "../src/providers/systemone.ts";
import type { SearchResult } from "../src/types.ts";

interface Task {
  id: string;
  query: string;
  labels: string[];
}

interface Arm {
  id: "legacy" | "locator";
  provider: ReturnType<typeof createJevProvider>;
}

const ROOT = resolve("bench", "locator", "fixtures");
const apiKey = process.env.TYPESAFE_API_KEY;

if (!apiKey) {
  console.error("TYPESAFE_API_KEY is required for the live prompt comparison");
  process.exit(1);
}

const tasks = (JSON.parse(await readFile(resolve("bench", "locator", "tasks.json"), "utf8")) as {
  tasks: Task[];
}).tasks;

const arms: Arm[] = [
  { id: "legacy", provider: createJevProvider({ apiKey, promptVariant: "legacy" }) },
  { id: "locator", provider: createJevProvider({ apiKey, promptVariant: "locator" }) },
];

const rows: Array<Record<string, unknown>> = [];

for (const arm of arms) {
  for (const task of tasks) {
    const started = performance.now();
    const result = await searchRepository({
      root: ROOT,
      query: task.query,
      provider: arm.provider,
      includeDiagnostics: true,
    });
    const elapsedMs = Math.round(performance.now() - started);
    const labels = new Set(task.labels);
    const returned = result.results.map((item) => item.path);
    const relevant = returned.filter((path) => labels.has(path));
    rows.push({
      arm: arm.id,
      task: task.id,
      elapsedMs,
      status: result.status,
      returned,
      relevant,
      precision: returned.length === 0 ? 0 : relevant.length / returned.length,
      recallAt5: result.results.slice(0, 5).filter((item) => labels.has(item.path)).length / labels.size,
      count: returned.length,
      searched: result.searched,
      ranked: result.diagnostics?.ranked.slice(0, 8) ?? [],
    });
    console.log(`${arm.id} ${task.id} ${result.status} ${elapsedMs}ms ${relevant.length}/${returned.length}`);
  }
}

await mkdir(resolve("bench", "locator", "runs"), { recursive: true });
await writeFile(resolve("bench", "locator", "runs", "results.json"), `${JSON.stringify(rows, null, 2)}\n`);

const lines = [
  "# Locator prompt comparison",
  "",
  "Live Jev comparison on `bench/locator/fixtures`; labels were fixed before running. This is a small synthetic fixture, not held-out evidence.",
  "",
  "| Arm | Task | Status | ms | Relevant/Returned | Precision | Recall@5 |",
  "| --- | --- | --- | ---: | ---: | ---: | ---: |",
  ...rows.map((row) =>
    `| ${row.arm} | ${row.task} | ${row.status} | ${row.elapsedMs} | ${(row.relevant as string[]).length}/${row.count} | ${Number(row.precision).toFixed(2)} | ${Number(row.recallAt5).toFixed(2)} |`,
  ),
  "",
  "Raw candidate and score traces: `bench/locator/runs/results.json`.",
  "",
];

for (const arm of arms) {
  const armRows = rows.filter((row) => row.arm === arm.id);
  const precision = armRows.reduce((sum, row) => sum + Number(row.precision), 0) / armRows.length;
  const recall = armRows.reduce((sum, row) => sum + Number(row.recallAt5), 0) / armRows.length;
  lines.push(`${arm.id}: mean precision ${precision.toFixed(2)}, mean recall@5 ${recall.toFixed(2)}`);
}

await writeFile(resolve("bench", "locator", "runs", "results.md"), `${lines.join("\n")}\n`);
console.log(`\n${lines.slice(-2).join("\n")}`);
