import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { exec } from "../src/engine/files.ts";
import { searchRepository } from "../src/engine/search.ts";
import { resolveProvider } from "../src/config.ts";
import { createClefProvider } from "../src/providers/systemone.ts";
import { createGeminiProvider } from "../src/providers/gemini.ts";
import { DEFAULT_LIMITS, type AblationStage, type Limits, type SearchResult } from "../src/types.ts";
import { RELEVANCE_CRITERIA, RELEVANCE_INSTRUCTIONS, type DecisionProvider } from "../src/providers/types.ts";

import { loadCorpus, repoRoot, validateCorpus, type Corpus, type Task } from "./corpus.ts";
import { toResult } from "./b0-parse.ts";
import { scoreRun, type Metrics } from "./metrics.ts";
import { buildPairedReport, buildReport } from "./report.ts";
import {
  MANIFEST_PATH,
  corpusVersion,
  loadManifest,
  protocolHash,
  sha256,
  validateRunRecords,
} from "./experiment.ts";

const STAGES: AblationStage[] = ["v0", "climb1", "climb2", "climb3"];

interface Arm {
  id: "none" | "jev" | "clef" | "gemini";
  label: string;
}

type GeminiLayout = "per-candidate" | "multi-question";

interface Variant {
  arm: Arm;
  id: string;
  layout: GeminiLayout;
  provider: DecisionProvider | null;
}

const ARMS: Record<string, Arm> = {
  lexical: { id: "none", label: "B1 deterministic (no provider)" },
  jev: { id: "jev", label: "Jev ranking" },
  clef: { id: "clef", label: "Clef ranking" },
  gemini: { id: "gemini", label: "Gemini Decisions ranking" },
};

interface BenchmarkRecord {
  runId: string;
  taskId: string;
  variantId: string;
  arm: string;
  armLabel: string;
  armId: Arm["id"];
  diagnostics: SearchResult["diagnostics"];
  repeat: number;
  startedAt: string;
  elapsedMs: number;
  stage: AblationStage;
  providerBudget: number;
  protocolHash: string;
  corpusVersion: string;
  implementationCommit: string;
  limits: Limits;
  metrics: Metrics;
  result: Omit<SearchResult, "results"> & { results: Array<Omit<SearchResult["results"][number], "excerpt">> };
  fallback: { elapsedMs: number; status: string; resultFiles: number } | null;
  providerRequests: Array<{ elapsedMs: number; status: number | null }>;
  estimatedPaidUsd: number | null;
  repository: { url: string; commit: string };
  promptHash: string | null;
}

function configureVariant(arm: Arm, layout: GeminiLayout, id: string): Variant {
  if (arm.id === "none") return { arm, id, layout, provider: null };
  let provider: DecisionProvider | null;
  if (arm.id === "clef") {
    const { CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: accountId } = process.env;
    if (!apiToken || !accountId) throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
    provider = createClefProvider({ apiToken, accountId });
  } else if (arm.id === "gemini" && layout === "multi-question") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is required");
    provider = createGeminiProvider({ apiKey, layout });
  } else {
    const resolution = resolveProvider(process.env, {}, arm.id);
    if (!resolution.provider) throw new Error(`arm ${arm.id} is not configured: ${resolution.error}`);
    provider = resolution.provider;
  }
  return { arm, id, layout, provider };
}

async function sourceHash(root: string): Promise<string> {
  const paths = (await readdir(join(root, "src"), { recursive: true })).filter((path) => /\.tsx?$/.test(path)).sort();
  const inputs = await Promise.all([...paths.map((path) => join("src", path)), "bench/run.ts", "bench/report.ts", "package-lock.json"].map(async (path) =>
    [path, sha256(await readFile(join(root, path), "utf8"))]));
  return sha256(JSON.stringify(inputs));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.root ?? process.cwd());
  const arm = ARMS[args.arm ?? "lexical"];
  if (!arm) throw new Error(`unknown arm: ${args.arm}. Use lexical, jev, clef, or gemini.`);
  const layout = args.layout ?? "per-candidate";
  if (layout !== "per-candidate" && layout !== "multi-question") throw new Error(`unknown Gemini layout: ${layout}`);
  if (layout !== "per-candidate" && arm.id !== "gemini") throw new Error("multi-question layout requires the Gemini arm");
  const seed = args.paired === "true" ? "gemini-layout-comparison" : args.paired;
  if (seed && (args.arm || args.layout || args.variant)) throw new Error("--paired selects Jev and both Gemini layouts");

  const corpus = await loadCorpus(root, args.corpus ?? "bench/corpus/tasks.json");
  const errors = await validateCorpus(root, corpus);
  if (errors.length > 0) {
    throw new Error(`corpus is invalid:\n${errors.join("\n")}`);
  }

  const tasks = selectTasks(corpus, args);
  const originalFetch = globalThis.fetch;
  let requests: Array<{ elapsedMs: number; status: number | null }> = [];
  globalThis.fetch = (async (input, init) => {
    const started = performance.now();
    let status: number | null = null;
    try {
      const response = await originalFetch(input, init);
      status = response.status;
      return response;
    } finally {
      requests.push({ elapsedMs: Math.round(performance.now() - started), status });
    }
  }) as typeof fetch;
  try {
    const stage = (args.stage ?? "climb3") as AblationStage;
    if (!STAGES.includes(stage)) throw new Error(`unknown stage: ${stage}. Use ${STAGES.join(", ")}.`);
    const providerBudget = Number(args["provider-budget"] ?? 24);
    if (!Number.isSafeInteger(providerBudget) || providerBudget < 1) throw new Error("--provider-budget must be a positive integer");
    const limits = { ...DEFAULT_LIMITS, ablationStage: stage, rankedCandidates: providerBudget };
    const variantId = args.variant ?? (arm.id === "gemini"
      ? layout === "multi-question" ? "GEMINI-MULTI-QUESTION" : "GEMINI-PER-CANDIDATE"
      : stage);
    const variants = seed ? [
      configureVariant(ARMS.jev!, "per-candidate", stage),
      configureVariant(ARMS.gemini!, "per-candidate", "GEMINI-PER-CANDIDATE"),
      configureVariant(ARMS.gemini!, "multi-question", "GEMINI-MULTI-QUESTION"),
    ] : [configureVariant(arm, layout, variantId)];

    const experimentManifest = await loadManifest(root);
    const currentProtocolHash = await protocolHash(root);
    const currentCorpusVersion = await corpusVersion(root, args.corpus ?? "bench/corpus/tasks.json");
    const implementationCommit = await gitCommit(root);
    const implementationSourceHash = await sourceHash(root);

    const repeat = Number(args.repeat ?? 1);
    if (!Number.isSafeInteger(repeat) || repeat < 1) throw new Error("--repeat must be a positive integer");
    const records: BenchmarkRecord[] = [];
    const fingerprints = new Map(variants.map((variant) => [variant.id, variant.provider ? sha256(JSON.stringify({
      instructions: RELEVANCE_INSTRUCTIONS, criteria: RELEVANCE_CRITERIA, layout: variant.layout, provider: variant.arm.id, implementationSourceHash,
    })) : null]));

    for (let run = 0; run < repeat; run += 1) {
      for (const task of tasks) {
        const ordering = (variant: Variant) => sha256(JSON.stringify([seed, task.id, run, variant.id]));
        const block = seed ? variants.toSorted((a, b) => ordering(a).localeCompare(ordering(b))) : variants;
        for (const variant of block) {
          const { arm, provider, id: variantId } = variant;
          requests = [];
          const directory = repoRoot(root, corpus, task.repo);
          const startedAt = new Date().toISOString();
          const started = performance.now();
          const result = await searchRepository({
            root: directory,
            query: task.question,
            provider,
            limits,
            includeDiagnostics: true,
          });
          const elapsedMs = Math.round(performance.now() - started);
          const providerRequests = [...requests];
          const metrics = scoreRun(task, result, elapsedMs, {
            failed: result.status === "fallback_required" || result.status === "cancelled",
            invalidCitations: 0,
          });
          const fallback = result.status === "fallback_required" && !args["no-fallback"]
            ? await measureFallback(task, directory, args)
            : null;
          const runId = sha256(
            [variantId, arm.id, task.id, run, startedAt].join("|"),
          ).slice(0, 24);
          records.push({
            runId,
            taskId: task.id,
            variantId,
            arm: arm.id,
            armLabel: arm.label,
            armId: arm.id,
            diagnostics: result.diagnostics,
            repeat: run,
            startedAt,
            elapsedMs,
            stage,
            providerBudget,
            protocolHash: currentProtocolHash,
            corpusVersion: currentCorpusVersion,
            implementationCommit,
            limits,
            metrics,
            result: { ...result, results: result.results.map(({ excerpt: _excerpt, ...evidence }) => evidence) },
            fallback,
            providerRequests,
            estimatedPaidUsd: arm.id === "gemini" && result.provider.usage
              ? result.provider.usage.input * 0.10 / 1_000_000
              : null,
            repository: { url: corpus.repos[task.repo]!.url, commit: corpus.repos[task.repo]!.commit },
            promptHash: fingerprints.get(variantId) ?? null,
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
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = resolve(root, args.out ?? join("bench", "runs", `${stamp}-${seed ? "paired" : arm.id}`));
    await mkdir(outDir, { recursive: true });

    const validationErrors = validateRunRecords(records, {
      manifest: experimentManifest,
      currentProtocolHash,
      currentCorpusVersion,
    });
    if (validationErrors.length > 0) {
      throw new Error(`run set failed experiment validation:\n${validationErrors.join("\n")}`);
    }

    const manifest = {
      arm: seed ? "Paired Jev and Gemini development runs" : arm.label,
      armId: seed ? null : arm.id,
      provider: seed ? null : arm.id,
      providerModel: records[0]?.result.provider.model ?? null,
      tasks: tasks.map((task) => task.id),
      repeat,
      stage,
      layout: arm.id === "gemini" ? layout : null,
      variantId,
      providerBudget,
      limits,
      protocolHash: currentProtocolHash,
      corpusVersion: currentCorpusVersion,
      implementationCommit,
      implementationSourceHash,
      seed: seed ?? null,
      measuredFallback: !args["no-fallback"],
      variants: variants.map((variant) => ({
        id: variant.id, label: variant.arm.label, provider: variant.arm.id, model: variant.provider?.model ?? null,
        layout: variant.arm.id === "gemini" ? variant.layout : null,
        promptHash: fingerprints.get(variant.id) ?? null,
        threshold: variant.provider ? variant.provider.minDecision === undefined ? DEFAULT_LIMITS.minDecision : variant.provider.minDecision : null,
      })),
      experimentManifest: MANIFEST_PATH,
      corpus: args.corpus ?? "bench/corpus/tasks.json",
      opencodeVersion: await opencodeVersion(root),
      node: process.version,
      startedAt: new Date().toISOString(),
    };

    await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(join(outDir, "records.json"), `${JSON.stringify(records, null, 2)}\n`);
    await writeFile(join(outDir, "records.jsonl"), `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
    const report = seed ? buildPairedReport(manifest, records) : buildReport(manifest, records);
    await writeFile(join(outDir, "report.md"), report);
    process.stdout.write(`\nWrote ${outDir}\n\n${report}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
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

async function gitCommit(root: string): Promise<string> {
  const result = await exec("git", ["rev-parse", "HEAD"], { cwd: root, timeoutMs: 10_000 });
  if (result.code !== 0) throw new Error("could not resolve implementation commit");
  return result.stdout.trim();
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
