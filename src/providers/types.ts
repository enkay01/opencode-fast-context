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
}

export interface DecisionProvider {
  id: "jev" | "clef";
  model: string;
  score(query: string, candidates: ScoreCandidate[], options: ScoreOptions): Promise<ScoreResult>;
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
  "Does this code snippet provide direct evidence that answers the developer's question? " +
  "Judge whether the code implements, defines, or explains the behavior asked about. " +
  "A snippet that only shares words or topic is not evidence.";

export const RELEVANCE_CRITERIA = {
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
