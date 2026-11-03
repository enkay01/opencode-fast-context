import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { EvidenceRange } from "../src/types.ts";

export interface Label {
  path: string;
  ranges: EvidenceRange[];
}

export interface Task {
  id: string;
  repo: string;
  split: "tuning" | "held-out";
  question: string;
  labels: Label[];
  /** True when no code in the repository answers the question. */
  absent?: boolean;
}

export interface Repo {
  url: string;
  commit: string;
  path: string;
  tag?: string;
}

export interface Corpus {
  version: 1;
  repos: Record<string, Repo>;
  tasks: Task[];
}

export const CORPUS_PATH = "bench/corpus/tasks.json";

export async function loadCorpus(root: string, path = CORPUS_PATH): Promise<Corpus> {
  const raw = await readFile(resolve(root, path), "utf8");
  const corpus = JSON.parse(raw) as Corpus;
  if (corpus.version !== 1) throw new Error(`unsupported corpus version: ${String(corpus.version)}`);
  return corpus;
}

export function repoRoot(root: string, corpus: Corpus, repoName: string): string {
  const repo = corpus.repos[repoName];
  if (!repo) throw new Error(`unknown repo in corpus: ${repoName}`);
  return resolve(root, repo.path);
}

/** Verify every label points at a real file and line range in the pinned checkout. */
export async function validateCorpus(root: string, corpus: Corpus): Promise<string[]> {
  const errors: string[] = [];
  for (const task of corpus.tasks) {
    if (!corpus.repos[task.repo]) {
      errors.push(`${task.id}: unknown repo ${task.repo}`);
      continue;
    }
    const repoPath = repoRoot(root, corpus, task.repo);
    if (task.absent) {
      if (task.labels.length > 0) errors.push(`${task.id}: absent task has labels`);
      continue;
    }
    if (task.labels.length === 0) errors.push(`${task.id}: task has no labels`);
    for (const label of task.labels) {
      const absolute = join(repoPath, label.path);
      const info = await stat(absolute).catch(() => null);
      if (!info?.isFile()) {
        errors.push(`${task.id}: missing file ${label.path}`);
        continue;
      }
      const lineCount = (await readFile(absolute, "utf8")).split("\n").length;
      for (const range of label.ranges) {
        if (range.start < 1 || range.end < range.start || range.end > lineCount) {
          errors.push(
            `${task.id}: range ${label.path}:${range.start}-${range.end} outside 1..${lineCount}`,
          );
        }
      }
    }
  }
  return errors;
}
