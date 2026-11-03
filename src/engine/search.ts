import { DEFAULT_LIMITS, type Evidence, type EvidenceRange, type Limits, type ProviderInfo, type SearchResult, type SearchStatus } from "../types.ts";
import { dirname } from "node:path";
import { discover, readCandidateExcerpt, type Candidate } from "./discover.ts";
import type { DecisionProvider } from "../providers/types.ts";

export interface SearchOptions {
  root: string;
  query: string;
  maxFiles?: number;
  limits?: Partial<Limits>;
  provider?: DecisionProvider | null;
  signal?: AbortSignal;
  /** Called as each pipeline stage completes; keep it out of model-facing output. */
  onStage?: (stage: string) => void;
  /** Attach the discovery pool and ranked decisions for benchmark instrumentation. */
  includeDiagnostics?: boolean;
}

interface RankedCandidate extends Candidate {
  decisionScore: number | null;
}

export async function searchRepository(options: SearchOptions): Promise<SearchResult> {
  const started = Date.now();
  const limits: Limits = {
    ...DEFAULT_LIMITS,
    ...options.limits,
    ...(options.maxFiles ? { maxFiles: options.maxFiles } : {}),
  };
  const stage = limits.ablationStage ?? "climb3";
  const deadline = started + limits.deadlineMs;
  const query = options.query.trim();
  const diagnostics = {
    poolFiles: [] as string[],
    ranked: [] as Array<{ path: string; decision: number | null; lexical: number }>,
    abstained: false,
    abstainThreshold: limits.minDecision as number | null,
    discoveryTimedOut: false,
  };
  const providerInfo: ProviderInfo = {
    id: options.provider?.id ?? "none",
    model: options.provider?.model ?? null,
    usage: null,
  };

  const result = (
    status: SearchStatus,
    evidence: Evidence[],
    extra: Partial<SearchResult> = {},
  ): SearchResult => {
    const total = Date.now() - started;
    return {
      version: 1,
      query,
      status,
      results: evidence,
      truncated: extra.truncated ?? false,
      candidateCount: extra.candidateCount ?? 0,
      provider: extra.provider ?? providerInfo,
      timings: { discovery: extra.timings?.discovery ?? 0, ranking: extra.timings?.ranking ?? 0, total },
      ...(extra.reason ? { reason: extra.reason } : {}),
      ...(options.includeDiagnostics ? { diagnostics } : {}),
    };
  };

  if (!query) {
    return result("no_match", [], { reason: "empty query" });
  }
  if (options.signal?.aborted) {
    return result("cancelled", [], { reason: "cancelled before search" });
  }

  options.onStage?.("discovery");
  const discoveryStart = Date.now();
  const discovery = await discover(options.root, query, limits, {
    deadline,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const discoveryMs = Date.now() - discoveryStart;
  diagnostics.poolFiles = [...new Set(discovery.candidates.map((candidate) => candidate.path))].slice(0, 200);
  diagnostics.discoveryTimedOut = discovery.timedOut;

  if (options.signal?.aborted) {
    return result("cancelled", [], { candidateCount: discovery.candidates.length, timings: { discovery: discoveryMs, ranking: 0, total: 0 } });
  }

  if (discovery.candidates.length === 0) {
    if (discovery.timedOut) {
      return result("fallback_required", [], {
        candidateCount: 0,
        timings: { discovery: discoveryMs, ranking: 0, total: 0 },
        reason: "discovery deadline expired before any candidate was found",
      });
    }
    return result("no_match", [], {
      candidateCount: 0,
      timings: { discovery: discoveryMs, ranking: 0, total: 0 },
      reason: "no lexical candidates",
    });
  }

  const lexicalPool = discovery.candidates;
  let ranked: RankedCandidate[] = lexicalPool.map((candidate) => ({ ...candidate, decisionScore: null }));
  let provider = providerInfo;
  let status: SearchStatus = "complete";
  let reason: string | undefined;
  let rankingMs = 0;

  if (options.provider) {
    options.onStage?.("ranking");
    const rankingStart = Date.now();
    const providerLimit = Math.min(
      limits.rankedCandidates,
      options.provider.maxCandidates ?? limits.rankedCandidates,
    );
    const hint = await chooseDirectory(options.provider, query, lexicalPool, deadline, options.signal);
    const shortlist = providerShortlist(lexicalPool, providerLimit, hint, stage === "climb3" ? 2 : 1);
    const scoredCandidates = await Promise.all(
      shortlist.map(async (candidate) => ({
        candidate,
        checked: await readCandidateExcerpt(
          options.root,
          {
            ...candidate,
            ranges: candidate.ranges.map((range) => ({
              start: Math.max(1, range.start - 8),
              end: range.end + 12,
            })),
          },
          limits.maxFileBytes,
        ),
      })),
    );
    const sendable = scoredCandidates.filter((item) => item.checked !== null);

    try {
      const scoring = await options.provider.score(
        query,
        sendable.map(({ candidate, checked }) => ({
          id: candidate.id,
          path: candidate.path,
          code: checked?.text ?? candidate.excerpt,
        })),
        {
          deadline,
          concurrency: limits.concurrency,
          ...(options.signal ? { signal: options.signal } : {}),
        },
      );
      provider = {
        id: options.provider.id,
        model: scoring.model,
        usage: scoring.usage,
      };
      const scored: RankedCandidate[] = [];
      const scoredIds = new Set<string>();
      for (const { candidate } of sendable) {
        const decision = scoring.scores[candidate.id];
        if (decision === undefined) continue;
        scored.push({ ...candidate, decisionScore: decision });
        scoredIds.add(candidate.id);
      }
      scored.sort(
        (a, b) =>
          (b.decisionScore ?? 0) - (a.decisionScore ?? 0) ||
          b.lexicalScore - a.lexicalScore ||
          a.path.localeCompare(b.path),
      );
      const unscored = lexicalPool
        .filter((candidate) => !scoredIds.has(candidate.id))
        .map((candidate) => ({ ...candidate, decisionScore: null }));
      ranked = [...scored, ...unscored];

      if (scoring.skipped > 0) {
        status = "partial";
        reason = `${scoring.skipped} candidates were not scored before the deadline or after a provider error`;
      }
    } catch (error) {
      rankingMs = Date.now() - rankingStart;
      status = "fallback_required";
      reason = `decision provider ${options.provider.id} failed: ${(error as Error).message}`;
      ranked = lexicalPool.map((candidate) => ({ ...candidate, decisionScore: null })) as RankedCandidate[];
    }
    rankingMs = Date.now() - rankingStart;
  } else {
    ranked = lexicalPool.map((candidate) => ({ ...candidate, decisionScore: null })) as RankedCandidate[];
  }

  if (options.signal?.aborted) {
    return result("cancelled", [], {
      candidateCount: discovery.candidates.length,
      timings: { discovery: discoveryMs, ranking: rankingMs, total: 0 },
      provider,
    });
  }

  options.onStage?.("evidence");
  const evidence: Evidence[] = [];
  let usedLines = 0;
  let truncated = false;

  // Group secondary windows per file so multi-range targets in the same file can be combined
  const secondaryByPath = new Map<string, RankedCandidate[]>();
  if (stage === "climb3") {
    for (const candidate of ranked) {
      const list = secondaryByPath.get(candidate.path) ?? [];
      list.push(candidate);
      secondaryByPath.set(candidate.path, list);
    }
  }

  for (const candidate of ranked) {
    if (evidence.length >= limits.maxFiles) {
      truncated = true;
      break;
    }
    if (evidence.some((item) => item.path === candidate.path)) continue;

    let combinedRanges = [...candidate.ranges];
    if (stage === "climb3") {
      const siblings = secondaryByPath.get(candidate.path) ?? [];
      for (const sib of siblings.slice(1, 3)) {
        const allowSibling =
          candidate.decisionScore !== null
            ? (sib.decisionScore !== null && sib.decisionScore >= limits.minDecision) ||
              sib.lexicalScore >= candidate.lexicalScore * 0.72
            : sib.lexicalScore >= candidate.lexicalScore * 0.68;
        if (allowSibling) {
          combinedRanges.push(...sib.ranges);
        }
      }
      combinedRanges = mergeRanges(combinedRanges);
    }

    const checked = await readCandidateExcerpt(
      options.root,
      { ...candidate, ranges: combinedRanges },
      limits.maxFileBytes,
    );
    if (!checked) continue;

    const remaining = limits.maxLines - usedLines;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const clipped = clipSections(checked.sections, remaining);
    if (clipped.sections.length === 0) continue;

    evidence.push({
      path: candidate.path,
      ranges: clipped.sections.map((section) => section.range),
      digest: checked.digest,
      excerpt: clipped.sections.map((section) => section.text).join("\n…\n"),
      scores: {
        lexical: round(candidate.lexicalScore),
        decision: candidate.decisionScore === null ? null : round(candidate.decisionScore),
      },
    });
    usedLines += clipped.lines;
    if (clipped.truncated) truncated = true;
  }

  const topDecision = ranked.find((candidate) => candidate.decisionScore !== null)?.decisionScore ?? null;
  if (options.provider && status !== "fallback_required" && topDecision !== null && topDecision < limits.minDecision) {
    diagnostics.abstained = true;
    diagnostics.ranked = ranked.slice(0, 64).map((candidate) => ({
      path: candidate.path,
      decision: candidate.decisionScore,
      lexical: candidate.lexicalScore,
    }));
    return result("no_match", [], {
      candidateCount: discovery.candidates.length,
      timings: { discovery: discoveryMs, ranking: rankingMs, total: 0 },
      provider,
      reason: `no candidate passed the relevance threshold (best score ${topDecision.toFixed(2)})`,
    });
  }

  if (evidence.length === 0) {
    return result("no_match", [], {
      candidateCount: discovery.candidates.length,
      timings: { discovery: discoveryMs, ranking: rankingMs, total: 0 },
      provider,
      reason: reason ?? "candidates were found but no readable evidence remained",
    });
  }

  if (discovery.candidates.length > evidence.length) truncated = true;

  diagnostics.ranked = ranked.slice(0, 64).map((candidate) => ({
    path: candidate.path,
    decision: candidate.decisionScore,
    lexical: candidate.lexicalScore,
  }));

  if (discovery.timedOut && status === "complete") {
    status = "partial";
    reason = "discovery deadline expired before all search waves completed";
  }

  return result(status, evidence, {
    truncated,
    candidateCount: discovery.candidates.length,
    provider,
    timings: { discovery: discoveryMs, ranking: rankingMs, total: 0 },
    ...(reason ? { reason } : {}),
  });
}

function mergeRanges(ranges: EvidenceRange[]): EvidenceRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: EvidenceRange[] = [];
  for (const r of sorted) {
    const last = merged.at(-1);
    if (last && r.start <= last.end + 2) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  }
  return merged;
}

function bestWindowPerFile(candidates: Candidate[], limit: number, maxPerFile = 1): Candidate[] {
  const counts = new Map<string, number>();
  const picked: Candidate[] = [];
  const topScore = candidates[0]?.lexicalScore ?? 0;

  // Pass 1: top 1 window per file in lexical order
  for (const candidate of candidates) {
    if ((counts.get(candidate.path) ?? 0) >= 1) continue;
    counts.set(candidate.path, 1);
    picked.push(candidate);
    if (picked.length >= limit) return picked;
  }

  // Pass 2 (if maxPerFile > 1 and budget remains, or replace tail slots with high-scoring 2nd windows of top files)
  if (maxPerFile > 1) {
    const secondWindows = candidates.filter((c) => {
      const firstIdx = picked.findIndex((p) => p.path === c.path);
      return (
        firstIdx !== -1 &&
        firstIdx < 5 &&
        picked[firstIdx]!.id !== c.id &&
        c.lexicalScore >= topScore * 0.52
      );
    });
    let replaceOffset = picked.length - 1;
    for (const sec of secondWindows.slice(0, 4)) {
      if ((counts.get(sec.path) ?? 0) >= maxPerFile) continue;
      counts.set(sec.path, (counts.get(sec.path) ?? 0) + 1);
      if (picked.length < limit) {
        picked.push(sec);
      } else if (replaceOffset >= 16) {
        picked[replaceOffset] = sec;
        replaceOffset -= 1;
      }
    }
  }

  return picked;
}

async function chooseDirectory(
  provider: DecisionProvider,
  query: string,
  candidates: Candidate[],
  deadline: number,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!provider.choose) return null;
  if (process.env.FAST_CONTEXT_DIRECTORY_HINT !== "1") return null;
  if (deadline - Date.now() < 2500) return null;

  const byDirectory = new Map<string, number[]>();
  for (const candidate of candidates) {
    const directory = dirname(candidate.path);
    const scores = byDirectory.get(directory) ?? [];
    scores.push(candidate.lexicalScore);
    byDirectory.set(directory, scores);
  }

  const directories = [...byDirectory.entries()]
    .map(([directory, scores]) => ({
      directory,
      score: scores.sort((a, b) => b - a).slice(0, 3).reduce((sum, score) => sum + score, 0),
      count: scores.length,
    }))
    .filter((entry) => entry.directory !== ".")
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (directories.length < 2) return null;

  try {
    const result = await provider.choose(
      query,
      directories.map((entry) => ({
        id: entry.directory,
        label: `${entry.directory} (${entry.count} matching files)`,
      })),
      { deadline, ...(signal ? { signal } : {}) },
    );
    return result.choice;
  } catch {
    return null;
  }
}

function providerShortlist(
  candidates: Candidate[],
  limit: number,
  hint: string | null,
  maxPerFile = 1,
): Candidate[] {
  const base = bestWindowPerFile(candidates, limit, maxPerFile);
  if (!hint) return base;

  const chosen = new Set(base.map((candidate) => candidate.id));
  const extras = bestWindowPerFile(
    candidates.filter((candidate) => dirname(candidate.path) === hint),
    10,
    1,
  ).filter((candidate) => !chosen.has(candidate.id));

  const merged = [...base];
  for (const extra of extras) {
    if (merged.length < limit) merged.push(extra);
    else merged[merged.length - 1] = extra;
  }
  return merged;
}

function clipSections(
  sections: { range: EvidenceRange; text: string }[],
  budget: number,
): { sections: { range: EvidenceRange; text: string }[]; lines: number; truncated: boolean } {
  const kept: { range: EvidenceRange; text: string }[] = [];
  let remaining = budget;
  let truncated = false;

  for (const section of sections) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const lines = section.text.split("\n");
    const keep = Math.min(lines.length, remaining);
    if (keep < lines.length) truncated = true;
    kept.push({
      range: { start: section.range.start, end: section.range.start + keep - 1 },
      text: lines.slice(0, keep).join("\n"),
    });
    remaining -= keep;
  }

  return { sections: kept, lines: budget - remaining, truncated };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
