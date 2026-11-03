import { readFile, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { Evidence, SearchResult } from "../src/types.ts";

export interface Citation {
  path: string;
  start: number;
  end: number;
}

export interface ParsedAnswer {
  citations: Citation[];
  /** True only for an exact NO_ANSWER response. */
  noAnswer: boolean;
}

const CITATION = /^\s*([^\s:]+\.\w+):(\d+)-(\d+)\s*$/;

export function parseAnswer(answer: string): ParsedAnswer {
  const citations: Citation[] = [];
  for (const line of answer.split("\n")) {
    const match = CITATION.exec(line);
    if (!match) continue;
    citations.push({
      path: match[1] as string,
      start: Number(match[2]),
      end: Number(match[3]),
    });
  }
  return {
    citations,
    noAnswer: answer.trim().toUpperCase() === "NO_ANSWER",
  };
}

export function normalizePath(path: string, root: string, repo: string): string {
  let value = path.replace(/\\/g, "/");
  const markers = [`bench/repos/${repo}/`, `${root.replace(/\\/g, "/")}/`];
  for (const marker of markers) {
    const index = value.indexOf(marker);
    if (index >= 0) {
      value = value.slice(index + marker.length);
      break;
    }
  }
  return value.replace(/^\.\//, "");
}

/** Reject paths outside the worktree, missing files, and ranges outside the file. */
export async function validateCitations(
  root: string,
  citations: Citation[],
): Promise<{ valid: Evidence[]; invalid: number }> {
  const valid: Evidence[] = [];
  let invalid = 0;
  const realRoot = await realpath(root).catch(() => null);

  for (const citation of citations) {
    if (!realRoot || !Number.isInteger(citation.start) || !Number.isInteger(citation.end)) {
      invalid += 1;
      continue;
    }
    if (citation.start < 1 || citation.end < citation.start) {
      invalid += 1;
      continue;
    }

    // Reject absolute paths and traversal before touching the filesystem.
    if (citation.path.startsWith("/") || citation.path.split(sep).includes("..")) {
      invalid += 1;
      continue;
    }

    const absolute = join(realRoot, citation.path);
    const realFile = await realpath(absolute).catch(() => null);
    if (!realFile || !realFile.startsWith(`${realRoot}${sep}`)) {
      invalid += 1;
      continue;
    }

    const text = await readFile(realFile, "utf8").catch(() => null);
    if (text === null) {
      invalid += 1;
      continue;
    }
    const lineCount = text.split(/\r?\n/).length;
    if (citation.end > lineCount) {
      invalid += 1;
      continue;
    }

    valid.push({
      path: relative(realRoot, realFile).split(sep).join("/"),
      ranges: [{ start: citation.start, end: citation.end }],
      digest: "",
      excerpt: "",
      scores: { lexical: 0, decision: null },
    });
  }

  return { valid, invalid };
}

export interface ParsedRun {
  result: SearchResult;
  malformed: boolean;
  noAnswer: boolean;
  invalidCitations: number;
}

export async function toResult(
  question: string,
  answer: string,
  root: string,
  repo: string,
): Promise<ParsedRun> {
  const parsed = parseAnswer(answer);
  const normalized = parsed.citations.map((citation) => ({
    ...citation,
    path: normalizePath(citation.path, root, repo),
  }));
  const { valid, invalid } = await validateCitations(root, normalized);

  const malformed = !parsed.noAnswer && parsed.citations.length === 0;
  const status = malformed
    ? "fallback_required"
    : valid.length > 0
      ? "complete"
      : "no_match";

  return {
    malformed,
    noAnswer: parsed.noAnswer,
    invalidCitations: invalid,
    result: {
      version: 1,
      query: question,
      status,
      results: valid,
      truncated: invalid > 0,
      candidateCount: parsed.citations.length,
      provider: { id: "none", model: null, usage: null },
      timings: { discovery: 0, ranking: 0, total: 0 },
      ...(invalid > 0 ? { reason: `${invalid} citation(s) failed validation` } : {}),
    },
  };
}
