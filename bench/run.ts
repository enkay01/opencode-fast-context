import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { searchRepository } from "../src/engine/search.ts";
import { resolveProvider, type ProviderKind } from "../src/config.ts";
import type { SearchResult } from "../src/types.ts";
import { loadCorpus, repoRoot, validateCorpus, type Corpus, type Task } from "./corpus.ts";
import { toResult } from "./b0-parse.ts";
import { scoreRun, type Metrics } from "./metrics.ts";
import { buildReport } from "./report.ts";

interface Arm {
  id: ProviderKind;
  label: string;
}

const ARMS: Record<string, Arm> = {
  lexical: { id: "none", label: "B1 deterministic (no provider)" },
  jev: { id: "jev", label: "Jev ranking" },
  clef: { id: "clef", label: "Clef ranking" },
};

interface Record {
  taskId: string;
  arm: string;
  repeat: number;
  startedAt: string;
  elapsedMs: number;
  metrics: Metrics;
  result: SearchResult;
  fallback: { elapsedMs: number; status: string; resultFiles: number } | null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.root ?? process.cwd());
  const arm = ARMS[args.arm ?? "lexical"];
  if (!arm) throw new Error(`unknown arm: ${args.arm}. Use lexical, jev, or clef.`);

  const corpus = await loadCorpus(root, args.corpus ?? "bench/corpus/tasks.json");
  const errors = await validateCorpus(root, corpus);
  if (errors.length > 0) {
    throw new Error(`corpus is invalid:\n${errors.join("\n")}`);
  }

  const tasks = selectTasks(corpus, args);
  const resolution = resolveProvider({ provider: arm.id });
  if (arm.id !== "none" && !resolution.provider) {
    throw new Error(`arm ${arm.id} is not configured: ${resolution.error}`);
  }

  const repeat = Math.max(1, Number(args.repeat ?? 1));
  const concurrency = Math.max(1, Number(args.concurrency ?? 1));
  const records: Record[] = [];

  for (let run = 0; run < repeat; run += 1) {
    for (const task of tasks) {
      const directory = repoRoot(root, corpus, task.repo);
      const startedAt = new Date().toISOString();
      const started = performance.now();
      const result = await searchRepository({
        root: directory,
        query: task.question,
        provider: resolution.provider,
        onStage: () => undefined,
      });
      const elapsedMs = Math.round(performance.now() - started);
      const metrics = scoreRun(task, result, elapsedMs, {
        failed: result.status === "fallback_required" && result.results.length === 0,
        invalidCitations: 0,
      });
      const fallback = result.status === "fallback_required"
        ? await measureFallback(task, directory, args)
        : null;
      records.push({
        taskId: task.id,
        arm: arm.label,
        repeat: run,
        startedAt,
        elapsedMs,
        metrics,
        result,
        fallback,
      });
      process.stdout.write(
        `${arm.label} · ${task.id} · ${result.status} · ${elapsedMs}ms · ` +
          `P@5=${format(metrics.precisionAt5)} R@5=${format(metrics.recallAt5)} ` +
          `lines=${format(metrics.lineCoverage)}` +
          (fallback ? ` · fallback ${fallback.elapsedMs}ms (${fallback.status})` : "") +
          "\n",
      );
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(root, args.out ?? join("bench", "runs", `${stamp}-${arm.id}`));
  await mkdir(outDir, { recursive: true });

  const manifest = {
    arm: arm.label,
    provider: arm.id,
    providerModel: records[0]?.result.provider.model ?? null,
    tasks: tasks.map((task) => task.id),
    repeat,
    corpus: args.corpus ?? "bench/corpus/tasks.json",
    opencodeVersion: await opencodeVersion(root),
    node: process.version,
    startedAt: new Date().toISOString(),
  };

  await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(outDir, "records.json"), `${JSON.stringify(records, null, 2)}\n`);
  const report = buildReport(manifest, records);
  await writeFile(join(outDir, "report.md"), report);
  process.stdout.write(`\nWrote ${outDir}\n\n${report}`);
}

function selectTasks(corpus: Corpus, args: Record<string, string | undefined>): Task[] {
  let tasks = corpus.tasks;
  if (args.split) tasks = tasks.filter((task) => task.split === args.split);
  if (args.tasks) {
    const wanted = new Set(args.tasks.split(",").map((id) => id.trim()).filter(Boolean));
    tasks = tasks.filter((task) => wanted.has(task.id));
  }
  if (tasks.length === 0) throw new Error("no tasks selected");
  return tasks;
}

function format(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(2);
}

async function measureFallback(
  task: Task,
  directory: string,
  args: Record<string, string | undefined>,
): Promise<{ elapsedMs: number; status: string; resultFiles: number }> {
  const model = args.model ?? process.env.B0_MODEL ?? "opencode-go/deepseek-v4.1-flash";
  const prompt =
    "Find the code that answers this question. Reply only with repository-relative paths and inclusive " +
    "line ranges in the form path:start-end, one per line. If the repository has no such code, reply exactly " +
    `NO_ANSWER.\n\nQuestion: ${task.question}`;
  const started = performance.now();
  const answer = await captureText(
    ["opencode", "run", "--standalone", "--model", model, "--auto", "--format", "json", prompt],
    directory,
    Number(args.timeout ?? 180_000),
  );
  const parsed = await toResult(task.question, answer, directory, task.repo);
  return {
    elapsedMs: Math.round(performance.now() - started),
    status: parsed.result.status,
    resultFiles: parsed.result.results.length,
  };
}

function captureText(command: string[], cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolvePromise) => {
    const child = spawn(command[0] as string, command.slice(1), { cwd, stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => {
      clearTimeout(timer);
      resolvePromise("");
    });
    child.on("close", () => {
      clearTimeout(timer);
      let text = "";
      for (const line of Buffer.concat(chunks).toString("utf8").split("\n")) {
        if (!line.startsWith("{")) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "text" && typeof event.part?.text === "string") text = event.part.text;
        } catch {
          // ignore
        }
      }
      resolvePromise(text);
    });
  });
}

async function opencodeVersion(_root: string): Promise<string | null> {
  return process.env.OPENCODE_VERSION ?? null;
}

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const args: Record<string, string | undefined> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item?.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      args[key] = value;
      index += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
