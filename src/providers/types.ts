export interface ScoreCandidate {
  id: string;
  path: string;
  code: string;
}

export interface ScoreResult {
  /** Decision score per candidate id, 0..1. Missing ids were not scored. */
  scores: Record<string, number>;
  usage: { input: number; output: number } | null;
  model: string;
  /** Candidates that could not be scored before the deadline. */
  skipped: number;
}

export interface ScoreOptions {
  signal?: AbortSignal;
  deadline: number;
  concurrency: number;
  /** Per-request timeout ceiling in milliseconds; defaults to the remaining provider deadline (30_000ms for Jev). */
  requestTimeoutMs?: number;
}

export interface ChooseOption {
  id: string;
  label: string;
}

export interface ChooseResult {
  choice: string | null;
  probabilities: Record<string, number>;
  usage: { input: number; output: number } | null;
  model: string;
}

export interface DecisionProvider {
  id: "jev" | "clef";
  model: string;
  /** Optional cap on how many candidates this provider can rank inside the deadline. */
  maxCandidates?: number;
  score(query: string, candidates: ScoreCandidate[], options: ScoreOptions): Promise<ScoreResult>;
  /** Optional single-choice judgment over a bounded list of labels. */
  choose?(query: string, options: ChooseOption[], opts: { deadline: number; signal?: AbortSignal }): Promise<ChooseResult>;
}

export class ProviderError extends Error {
  readonly providerId: string;
  readonly status: number | null;

  constructor(providerId: string, message: string, status: number | null = null) {
    super(message);
    this.name = "ProviderError";
    this.providerId = providerId;
    this.status = status;
  }
}

export const RELEVANCE_INSTRUCTIONS =
  "Is this snippet relevant context for the developer's query? " +
  "Judge whether reading it would help locate, understand, or verify the targeted behavior. " +
  "It may be one part of the relevant context rather than a complete response. Shared words or topic alone are not enough.";

export const RELEVANCE_CRITERIA = {
  true:
    "The snippet contains code or documentation that would help the developer locate, understand, or verify " +
    "the behavior named in the query, even if it is only one part of the relevant context.",
  false:
    "The snippet is unrelated, or only shares words, imports, tests, or configuration without helping with the behavior named in the query.",
};

/** Previous prompt, kept only for the locator-contract comparison. */
export const RELEVANCE_INSTRUCTIONS_LEGACY =
  "Does this code snippet provide direct evidence that answers the developer's question? " +
  "Judge whether the code implements, defines, or explains the behavior asked about. " +
  "A snippet that only shares words or topic is not evidence.";

export const RELEVANCE_CRITERIA_LEGACY = {
  true:
    "The snippet implements, defines, calls, or directly documents the specific behavior named in the question, " +
    "so a developer reading it would learn how that behavior works.",
  false:
    "The snippet is unrelated, or only mentions similar words, imports, tests, or configuration without showing the behavior asked about.",
};

export function buildState(query: string, candidate: ScoreCandidate): Record<string, unknown> {
  return {
    question: query,
    candidate: {
      path: candidate.path,
      code: truncate(candidate.code, 4000),
    },
  };
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… truncated`;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}
