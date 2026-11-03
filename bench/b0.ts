import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { SearchResult } from "../src/types.ts";
import { toResult } from "./b0-parse.ts";
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
  exitCode: number | null;
  timedOut: boolean;
  malformed: boolean;
  isolatedHome: boolean;
}

const PROMPT = (question: string) =>
  "Find the code that answers this question. Reply only with repository-relative paths and inclusive " +
  "line ranges in the form path:start-end, one per line. If the repository has no such code, reply exactly " +
  `NO_ANSWER.\n\nQuestion: ${question}`;

interface IsolatedEnvironment {
  home: string;
  configPath: string;
  cleanup(): Promise<void>;
}

async function prepareIsolation(model: string): Promise<IsolatedEnvironment> {
  const home = await mkdtemp(join(tmpdir(), "fast-context-b0-"));
  const configDir = join(home, ".config", "opencode");
  const dataDir = join(home, ".local", "share", "opencode");
  await mkdir(configDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  const sourceAuth = join(homedir(), ".local", "share", "opencode", "auth.json");
  const targetAuth = join(dataDir, "auth.json");
  await import("node:fs/promises").then(({ symlink }) =>
    symlink(sourceAuth, targetAuth).catch(() => undefined),
  );

  const configPath = join(configDir, "opencode.json");
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        plugins: [],
        model: `opencode-go/${model.replace(/^.*\//, "")}`,
      },
      null,
      2,
    )}\n`,
  );

  return {
    home,
    configPath,
    cleanup: () => rm(home, { recursive: true, force: true }),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.root ?? process.cwd());
  const corpus = await loadCorpus(root, args.corpus ?? "bench/corpus/tasks.json");
  const errors = await validateCorpus(root, corpus);
  if (errors.length > 0) throw new Error(`corpus is invalid:\n${errors.join("\n")}`);

  const model = args.model ?? process.env.B0_MODEL ?? "opencode-go/deepseek-v4.1-flash";
  const repeat = Math.max(1, Number(args.repeat ?? 1));
  const tasks = selectTasks(corpus, args);
  const isolation = args.shared === "true" ? null : await prepareIsolation(model);
  const env = isolation ? { ...process.env, HOME: isolation.home } : process.env;
  const effective = await effectiveConfig(root, env, corpus.tasks[0]?.repo ?? "ripgrep");
  if (effective.pluginMentionsFastContext) {
    throw new Error("isolated B0 config still contains the fast context plugin; refusing to run");
  }

  const records: Record[] = [];
  try {
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
        const captured = await capture(command, cwd, Number(args.timeout ?? 180_000), env, true);
        const elapsedMs = Math.round(performance.now() - started);
        const parsed = await toResult(task.question, captured.stdoutText, cwd, task.repo);
        const failed = captured.code !== 0 || captured.timedOut;
        const metrics = scoreRun(task, parsed.result, elapsedMs, {
          failed,
          malformed: parsed.malformed,
          noAnswer: parsed.noAnswer,
          invalidCitations: parsed.invalidCitations,
        });
        records.push({
          taskId: task.id,
          arm: `B0 stock OpenCode (${model})`,
          repeat: run,
          startedAt: new Date().toISOString(),
          elapsedMs,
          metrics,
          result: parsed.result,
          rawAnswer: captured.stdoutText,
          command,
          exitCode: captured.code,
          timedOut: captured.timedOut,
          malformed: parsed.malformed,
          isolatedHome: isolation !== null,
        });
        process.stdout.write(
          `B0 · ${task.id} · exit ${captured.code}${captured.timedOut ? " timeout" : ""} · ${elapsedMs}ms · ` +
            `status ${parsed.result.status} · invalid ${parsed.invalidCitations} · ` +
            `top1=${metrics.top1Correct} P@5=${metrics.precisionAt5 ?? "n/a"} R@5=${metrics.recallAt5 ?? "n/a"} ` +
            `absent=${metrics.absentCorrect ?? "n/a"}\n`,
        );
      }
    }
  } finally {
    await isolation?.cleanup();
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
    opencodeVersion: await version(env),
    node: process.version,
    startedAt: new Date().toISOString(),
    isolatedHome: isolation !== null,
    isolatedConfig: effective,
    checkouts: await checkouts(root),
  };
  await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(outDir, "records.json"), `${JSON.stringify(records, null, 2)}\n`);
  await writeFile(join(outDir, "report.md"), buildReport(manifest, records));
  process.stdout.write(`\nWrote ${outDir}\n`);
}

async function effectiveConfig(
  root: string,
  env: NodeJS.ProcessEnv,
  repo: string,
): Promise<{
  configPaths: string[];
  plugins: string[];
  model: string | null;
  pluginMentionsFastContext: boolean;
  hash: string;
}> {
  const cwd = resolve(root, "bench", "repos", repo);
  const captured = await capture(["opencode", "debug", "config", "--standalone"], cwd, 60_000, env);
  let documents: any[] = [];
  try {
    documents = JSON.parse(captured.stdoutText);
  } catch {
    documents = [];
  }
  const paths = documents.map((doc) => String(doc.path)).filter((path) => path !== "undefined");
  const plugins = documents.flatMap((doc) =>
    Array.isArray(doc.info?.plugins) ? doc.info.plugins.map((item: unknown) => String(item)) : [],
  );
  const configured = documents.at(-1)?.info?.model;
  const model =
    typeof configured === "string"
      ? configured
      : configured && typeof configured === "object"
        ? `${configured.providerID ?? ""}/${configured.model ?? ""}`.replace(/^\/+$/, "")
        : null;
  const text = JSON.stringify(documents);
  return {
    configPaths: paths,
    plugins,
    model,
    pluginMentionsFastContext: /fast[-_ ]?context/i.test(JSON.stringify(plugins)),
    hash: createHash("sha256").update(text).digest("hex"),
  };
}

async function checkouts(root: string): Promise<Record<string, string | null>> {
  const corpus = await loadCorpus(root);
  const result: Record<string, string | null> = {};
  for (const [name, repo] of Object.entries(corpus.repos)) {
    const captured = await capture(["git", "rev-parse", "HEAD"], resolve(root, repo.path), 10_000, process.env);
    result[name] = captured.code === 0 ? captured.stdoutText.trim() : null;
  }
  return result;
}

interface CaptureResult {
  code: number | null;
  timedOut: boolean;
  stdoutText: string;
}

function capture(
  command: string[],
  cwd: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
  parseEvents = false,
): Promise<CaptureResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(command[0] as string, command.slice(1), {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", () => undefined);
    child.on("error", () => {
      clearTimeout(timer);
      resolvePromise({ code: null, timedOut, stdoutText: "" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString("utf8");
      resolvePromise({ code, timedOut, stdoutText: parseEvents ? extractText(raw) : raw });
    });
  });
}

function extractText(stdout: string): string {
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

async function version(env: NodeJS.ProcessEnv): Promise<string | null> {
  const captured = await capture(["opencode", "--version"], process.cwd(), 30_000, env);
  return captured.stdoutText.trim() || null;
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
