import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { Evidence, SearchResult } from "../src/types.ts";
import { loadCorpus, repoRoot, validateCorpus, type Corpus, type Task } from "./corpus.ts";
import { scoreRun } from "./metrics.ts";
import { buildReport } from "./report.ts";

interface Record {
  taskId: string;
  arm: string;
  repeat: number;
  startedAt: string;
  elapsedMs: number;
  metrics: ReturnType<typeof scoreRun>;
  result: SearchResult;
  rawAnswer: string;
  command: string[];
}

const PROMPT = (question: string) =>
  "Find the code that answers this question. Reply only with repository-relative paths and inclusive " +
  "line ranges in the form path:start-end, one per line. If the repository has no such code, reply exactly " +
  `NO_ANSWER.\n\nQuestion: ${question}`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.root ?? process.cwd());
  const corpus = await loadCorpus(root, args.corpus ?? "bench/corpus/tasks.json");
  const errors = await validateCorpus(root, corpus);
  if (errors.length > 0) throw new Error(`corpus is invalid:\n${errors.join("\n")}`);

  const model = args.model ?? process.env.B0_MODEL ?? "opencode-go/deepseek-v4.1-flash";
  const repeat = Math.max(1, Number(args.repeat ?? 1));
  const tasks = selectTasks(corpus, args);
  const records: Record[] = [];

  for (let run = 0; run < repeat; run += 1) {
    for (const task of tasks) {
      const cwd = repoRoot(root, corpus, task.repo);
      const command = [
        "opencode",
        "run",
        "--standalone",
        "--model",
        model,
        "--auto",
        "--format",
        "json",
        PROMPT(task.question),
      ];
      const started = performance.now();
      const { stdout, code } = await capture(command, cwd, Number(args.timeout ?? 180_000));
      const elapsedMs = Math.round(performance.now() - started);
      const answer = lastText(stdout);
      const result = toResult(task.question, answer, cwd, task.repo);
      const metrics = scoreRun(task, result, elapsedMs);
      records.push({
        taskId: task.id,
        arm: `B0 stock OpenCode (${model})`,
        repeat: run,
        startedAt: new Date().toISOString(),
        elapsedMs,
        metrics,
        result,
        rawAnswer: answer,
        command,
      });
      process.stdout.write(
        `B0 · ${task.id} · exit ${code} · ${elapsedMs}ms · top1=${metrics.top1Correct} ` +
          `P@5=${metrics.precisionAt5 ?? "n/a"} R@5=${metrics.recallAt5 ?? "n/a"}\n`,
      );
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(root, args.out ?? join("bench", "runs", `${stamp}-b0`));
  await mkdir(outDir, { recursive: true });
  const manifest = {
    arm: `B0 stock OpenCode (${model})`,
    provider: "deepseek",
    providerModel: model,
    tasks: tasks.map((task) => task.id),
    repeat,
    corpus: args.corpus ?? "bench/corpus/tasks.json",
    opencodeVersion: await version(),
    node: process.version,
    startedAt: new Date().toISOString(),
  };
  await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(outDir, "records.json"), `${JSON.stringify(records, null, 2)}\n`);
  await writeFile(join(outDir, "report.md"), buildReport(manifest, records));
  process.stdout.write(`\nWrote ${outDir}\n`);
}

function toResult(question: string, answer: string, cwd: string, repo: string): SearchResult {
  const results: Evidence[] = [];
  for (const line of answer.split("\n")) {
    const match = /^\s*([^\s:]+\.\w+):(\d+)-(\d+)\s*$/.exec(line);
    if (!match) continue;
    results.push({
      path: normalizePath(match[1] as string, cwd, repo),
      ranges: [{ start: Number(match[2]), end: Number(match[3]) }],
      digest: "",
      excerpt: "",
      scores: { lexical: 0, decision: null },
    });
  }
  const noAnswer = /NO_ANSWER/i.test(answer);
  return {
    version: 1,
    query: question,
    status: results.length > 0 ? "complete" : "no_match",
    results,
    truncated: false,
    candidateCount: results.length,
    provider: { id: "none", model: null, usage: null },
    timings: { discovery: 0, ranking: 0, total: 0 },
    ...(noAnswer ? {} : {}),
  };
}

function normalizePath(path: string, cwd: string, repo: string): string {
  let value = path.replace(/\\/g, "/");
  const markers = [`bench/repos/${repo}/`, `${cwd.replace(/\\/g, "/")}/`];
  for (const marker of markers) {
    const index = value.indexOf(marker);
    if (index >= 0) {
      value = value.slice(index + marker.length);
      break;
    }
  }
  return value.replace(/^\.\//, "");
}

function lastText(stdout: string): string {
  let text = "";
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "text" && typeof event.part?.text === "string") text = event.part.text;
    } catch {
      // ignore non-event output
    }
  }
  return text;
}

function capture(command: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command[0] as string, command.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", () => undefined);
    child.on("error", () => {
      clearTimeout(timer);
      resolvePromise({ stdout: "", code: null });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ stdout: Buffer.concat(chunks).toString("utf8"), code });
    });
  });
}

async function version(): Promise<string | null> {
  return new Promise((resolvePromise) => {
    const child = spawn("opencode", ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("close", () => resolvePromise(Buffer.concat(chunks).toString("utf8").trim() || null));
    child.on("error", () => resolvePromise(null));
  });
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
