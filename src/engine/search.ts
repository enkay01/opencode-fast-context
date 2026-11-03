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
}

export async function searchRepository(options: SearchOptions): Promise<SearchResult> {
  const started = Date.now();
  const limits: Limits = {
    ...DEFAULT_LIMITS,
    ...options.limits,
    ...(options.maxFiles ? { maxFiles: options.maxFiles } : {}),
  };
  const deadline = started + limits.deadlineMs;
  const query = options.query.trim();
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

  if (options.signal?.aborted) {
    return result("cancelled", [], { candidateCount: discovery.candidates.length, timings: { discovery: discoveryMs, ranking: 0, total: 0 } });
  }

  if (discovery.candidates.length === 0) {
    return result("no_match", [], {
      candidateCount: 0,
      timings: { discovery: discoveryMs, ranking: 0, total: 0 },
      ...(discovery.timedOut ? { reason: "discovery deadline expired" } : { reason: "no lexical candidates" }),
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
    const shortlist = providerShortlist(lexicalPool, providerLimit, hint);
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
      const scoredPaths = new Set<string>();
      for (const { candidate } of sendable) {
        const decision = scoring.scores[candidate.id];
        if (decision === undefined) continue;
        scored.push({ ...candidate, decisionScore: decision });
        scoredPaths.add(candidate.path);
      }
      scored.sort(
        (a, b) =>
          (b.decisionScore ?? 0) - (a.decisionScore ?? 0) ||
          b.lexicalScore - a.lexicalScore ||
          a.path.localeCompare(b.path),
      );
      const unscored = bestWindowPerFile(
        lexicalPool.filter((candidate) => !scoredPaths.has(candidate.path)),
        limits.candidates,
      ).map((candidate) => ({ ...candidate, decisionScore: null }));
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

  for (const candidate of ranked) {
    if (evidence.length >= limits.maxFiles) {
      truncated = true;
      break;
    }
    if (evidence.some((item) => item.path === candidate.path)) continue;

    const checked = await readCandidateExcerpt(options.root, candidate, limits.maxFileBytes);
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

  return result(status, evidence, {
    truncated,
    candidateCount: discovery.candidates.length,
    provider,
    timings: { discovery: discoveryMs, ranking: rankingMs, total: 0 },
    ...(reason ? { reason } : {}),
    ...(discovery.timedOut ? { reason: reason ?? "discovery deadline expired; results may be incomplete" } : {}),
  });
}

interface RankedCandidate extends Candidate {
  decisionScore: number | null;
}

/** Keep the highest-scoring window for each file, then take the best `limit` files. */
function bestWindowPerFile(candidates: Candidate[], limit: number): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const current = best.get(candidate.path);
    if (!current || candidate.lexicalScore > current.lexicalScore) best.set(candidate.path, candidate);
  }
  return [...best.values()]
    .sort((a, b) => b.lexicalScore - a.lexicalScore || a.path.localeCompare(b.path))
    .slice(0, limit);
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

function providerShortlist(candidates: Candidate[], limit: number, hint: string | null): Candidate[] {
  const base = bestWindowPerFile(candidates, limit);
  if (!hint) return base;

  const chosen = new Set(base.map((candidate) => candidate.path));
  const extras = bestWindowPerFile(
    candidates.filter((candidate) => dirname(candidate.path) === hint),
    10,
  ).filter((candidate) => !chosen.has(candidate.path));

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
