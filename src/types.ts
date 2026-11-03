export type SearchStatus =
  | "complete"
  | "partial"
  | "no_match"
  | "fallback_required"
  | "cancelled";

export type AblationStage = "v0" | "climb1" | "climb2" | "climb3";

export interface EvidenceRange {
  /** Inclusive, 1-based. */
  start: number;
  /** Inclusive, 1-based. */
  end: number;
}

export interface Evidence {
  /** Path relative to the search root, always forward-slash separated. */
  path: string;
  ranges: EvidenceRange[];
  /** SHA-256 of the file bytes when the evidence was checked. */
  digest: string;
  excerpt: string;
  scores: {
    lexical: number;
    /** null when no decision provider ran. */
    decision: number | null;
  };
}

export interface ProviderInfo {
  id: "none" | "jev" | "clef";
  model: string | null;
  usage: { input: number; output: number } | null;
}

export interface Timings {
  discovery: number;
  ranking: number;
  total: number;
}

export interface RetrievalDiagnostics {
  /** Unique files in the post-discovery pool, before provider ranking. */
  poolFiles: string[];
  /** Ranked candidates with the raw provider decision, if any. */
  ranked: Array<{ path: string; decision: number | null; lexical: number }>;
  /** True when the relevance threshold rejected every candidate. */
  abstained: boolean;
  abstainThreshold: number | null;
  discoveryTimedOut: boolean;
  /** Candidates whose payload was redacted before the provider saw it. */
  redactedCandidates?: number;
  /** Candidates rejected before the provider saw them. */
  rejectedCandidates?: number;
}

export interface SearchResult {
  version: 1;
  query: string;
  status: SearchStatus;
  results: Evidence[];
  truncated: boolean;
  candidateCount: number;
  provider: ProviderInfo;
  timings: Timings;
  reason?: string;
  diagnostics?: RetrievalDiagnostics;
}

export interface Limits {
  /** Maximum number of local ripgrep waves, including the query wave. */
  waves: number;
  /** Maximum concurrent local/provider operations. */
  concurrency: number;
  /** Maximum candidate windows kept after discovery. */
  candidates: number;
  /** Maximum candidate windows sent to a decision provider. */
  rankedCandidates: number;
  /** Maximum lines in one evidence window. */
  windowLines: number;
  /** Maximum files returned. */
  maxFiles: number;
  /** Maximum total evidence lines returned. */
  maxLines: number;
  /** Hard deadline in milliseconds. */
  deadlineMs: number;
  /** Largest file the engine will read, in bytes. */
  maxFileBytes: number;
  /** Below this top decision score, a provider-ranked search returns no_match. */
  minDecision: number;
  /** Optional ablation stage for reproducible hill-climb experiments. */
  ablationStage?: AblationStage;
}

export const DEFAULT_LIMITS: Limits = {
  waves: 4,
  concurrency: 8,
  candidates: 400,
  rankedCandidates: 24,
  windowLines: 28,
  maxFiles: 10,
  maxLines: 200,
  deadlineMs: 10_000,
  maxFileBytes: 2_000_000,
  minDecision: 0.15,
  ablationStage: "climb3",
};
