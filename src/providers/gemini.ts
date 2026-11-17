import {
  ProviderError,
  RELEVANCE_CRITERIA,
  RELEVANCE_INSTRUCTIONS,
  buildState,
  mapWithConcurrency,
  type ChooseOption,
  type ChooseResult,
  type DecisionProvider,
  type ScoreCandidate,
  type ScoreOptions,
  type ScoreResult,
} from "./types.ts";

export const GEMINI_DECISION_MODEL = "gemini-decision-1";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/decisions";

export interface GeminiConfig {
  apiKey: string;
  /** Benchmark-only variant; production uses independent per-candidate calls. */
  layout?: "per-candidate" | "multi-question";
  /** Private transport seams for deterministic tests. */
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

type Usage = { input: number; output: number };

function tokenUsage(value: unknown): Usage | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Number.isFinite(raw.total_input_tokens) || Number(raw.total_input_tokens) < 0) return null;
  if (!Number.isFinite(raw.total_output_tokens) || Number(raw.total_output_tokens) < 0) return null;
  return { input: Number(raw.total_input_tokens), output: Number(raw.total_output_tokens) };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderError("gemini", "invalid decision response");
  }
  return value as Record<string, unknown>;
}

export function createGeminiProvider(config: GeminiConfig): DecisionProvider {
  const transport = config.fetchImpl ?? fetch;
  const endpoint = config.endpoint ?? ENDPOINT;

  async function request(
    input: unknown,
    questions: Record<string, unknown>,
    deadline: number,
    signal?: AbortSignal,
  ): Promise<{ answers: Record<string, unknown>; usage: Usage | null }> {
    if (signal?.aborted) throw new ProviderError("gemini", "cancelled");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ProviderError("gemini", "deadline expired");
    let response: Response;
    try {
      response = await transport(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
        body: JSON.stringify({ model: GEMINI_DECISION_MODEL, input, questions }),
        signal: AbortSignal.any([AbortSignal.timeout(remaining), ...(signal ? [signal] : [])]),
      });
    } catch (error) {
      if (signal?.aborted) throw new ProviderError("gemini", "cancelled");
      const code = (error as Error).name === "TimeoutError" ? "timeout" : "network error";
      throw new ProviderError("gemini", `request failed (${code})`);
    }
    if (!response.ok) throw new ProviderError("gemini", `HTTP ${response.status}`, response.status);
    try {
      const body = object(await response.json());
      return { answers: object(body.answers), usage: tokenUsage(body.usage) };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("gemini", "invalid decision response");
    }
  }

  return {
    id: "gemini",
    model: GEMINI_DECISION_MODEL,
    minDecision: null,
    async score(query: string, candidates: ScoreCandidate[], options: ScoreOptions): Promise<ScoreResult> {
      if (config.layout === "multi-question") {
        if (candidates.length === 0) return { scores: {}, usage: null, model: GEMINI_DECISION_MODEL, skipped: 0 };
        if (candidates.length > 1000) throw new ProviderError("gemini", "too many candidate questions");
        const questions = Object.fromEntries(candidates.map((candidate, index) => [`candidate_${index}`, {
          type: "noul",
          instructions: `${RELEVANCE_INSTRUCTIONS} Judge only candidate_${index} at path ${candidate.path}.`,
          criteria: { true_description: RELEVANCE_CRITERIA.true, false_description: RELEVANCE_CRITERIA.false },
        }]));
        const result = await request(
          JSON.stringify({ question: query, candidates: candidates.map((candidate, index) => ({
            id: `candidate_${index}`, path: candidate.path, code: buildState(query, candidate).candidate,
          })) }),
          questions,
          Math.min(options.deadline, Date.now() + (options.requestTimeoutMs ?? 30_000)),
          options.signal,
        );
        const scores: Record<string, number> = {};
        let skipped = 0;
        for (const [index, candidate] of candidates.entries()) {
          const answer = result.answers[`candidate_${index}`];
          if (!answer || typeof answer !== "object") { skipped++; continue; }
          const raw = answer as Record<string, unknown>;
          if (raw.type !== "noul" || typeof raw.noul !== "number" || !Number.isFinite(raw.noul) || raw.noul < 0 || raw.noul > 1) {
            skipped++;
            continue;
          }
          scores[candidate.id] = raw.noul;
        }
        if (skipped === candidates.length) throw new ProviderError("gemini", "invalid relevance scores");
        return { scores, skipped, usage: result.usage, model: GEMINI_DECISION_MODEL };
      }
      const scores: Record<string, number> = {};
      let usage: Usage | null = null;
      let skipped = 0;
      let firstError: Error | null = null;
      let authError: ProviderError | null = null;
      await mapWithConcurrency(candidates, options.concurrency, async (candidate) => {
        if (options.signal?.aborted || Date.now() >= options.deadline) {
          skipped++;
          return;
        }
        try {
          const result = await request(
            JSON.stringify(buildState(query, candidate)),
            { relevant: {
              type: "noul",
              instructions: RELEVANCE_INSTRUCTIONS,
              criteria: {
                true_description: RELEVANCE_CRITERIA.true,
                false_description: RELEVANCE_CRITERIA.false,
              },
            } },
            Math.min(options.deadline, Date.now() + (options.requestTimeoutMs ?? 30_000)),
            options.signal,
          );
          const answer = object(result.answers.relevant);
          const value = answer.noul;
          if (answer.type !== "noul" || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
            throw new ProviderError("gemini", "invalid relevance score");
          }
          scores[candidate.id] = value;
          if (result.usage) {
            usage = {
              input: (usage?.input ?? 0) + result.usage.input,
              output: (usage?.output ?? 0) + result.usage.output,
            };
          }
        } catch (error) {
          skipped++;
          firstError ??= error as Error;
          if (error instanceof ProviderError && (error.status === 401 || error.status === 403)) authError ??= error;
        }
      });
      if (authError) throw authError;
      if (skipped > 0 && Object.keys(scores).length === 0) {
        throw firstError ?? new ProviderError("gemini", "no candidates scored before deadline");
      }
      return { scores, usage, model: GEMINI_DECISION_MODEL, skipped };
    },
    async choose(query: string, options: ChooseOption[], opts: { deadline: number; signal?: AbortSignal }): Promise<ChooseResult> {
      if (options.length < 2 || options.length > 255) {
        throw new ProviderError("gemini", "invalid choice count");
      }
      const ids = options.map((_, index) => `option_${index}`);
      const criteria = Object.fromEntries(options.map((option, index) => [ids[index]!, option.label]));
      const result = await request(
        query,
        { directory: { type: "choice", instructions: "Which directory most likely contains files relevant to the developer's query? Choose from the supplied directories only.", criteria } },
        opts.deadline,
        opts.signal,
      );
      const answer = object(result.answers.directory);
      if (answer.type !== "choice" || typeof answer.choice !== "string") {
        throw new ProviderError("gemini", "invalid directory choice");
      }
      const probabilities: Record<string, number> = {};
      const rawProbabilities = object(answer.probabilities);
      for (const [id, value] of Object.entries(rawProbabilities)) {
        const index = ids.indexOf(id);
        if (index >= 0 && typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1) {
          probabilities[options[index]!.id] = value;
        }
      }
      const selected = ids.indexOf(answer.choice);
      return { choice: selected < 0 ? null : options[selected]!.id, probabilities, usage: result.usage, model: GEMINI_DECISION_MODEL };
    },
  };
}
