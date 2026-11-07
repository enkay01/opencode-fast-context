import {
  ProviderError,
  RELEVANCE_CRITERIA,
  RELEVANCE_CRITERIA_LEGACY,
  RELEVANCE_INSTRUCTIONS,
  RELEVANCE_INSTRUCTIONS_LEGACY,
  buildState,
  mapWithConcurrency,
  type ChooseOption,
  type ChooseResult,
  type DecisionProvider,
  type ScoreCandidate,
  type ScoreOptions,
  type ScoreResult,
} from "./types.ts";

interface SystemOneResponse {
  model: string;
  answers: Record<string, { type: string; noul?: number }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function callSystemOne(
  providerId: string,
  url: string,
  headers: Record<string, string>,
  model: string,
  query: string,
  candidate: ScoreCandidate,
  timeoutMs: number,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  prompt: { instructions: string; criteria: { true: string; false: string } } = {
    instructions: RELEVANCE_INSTRUCTIONS,
    criteria: RELEVANCE_CRITERIA,
  },
): Promise<{ noul: number; model: string; usage: { input: number; output: number } | null }> {
  const body = {
    model,
    state: buildState(query, candidate),
    questions: {
      relevant: {
        type: "noul",
        instructions: prompt.instructions,
        criteria: prompt.criteria,
      },
    },
  };

  const signals = [AbortSignal.timeout(Math.max(1, timeoutMs))];
  if (signal) signals.push(signal);

  let response: Response;
  try {
    response = await fetchImplRef.current(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.any(signals),
    });
  } catch (error) {
    if (signal?.aborted) throw new ProviderError(providerId, "cancelled");
    const code = (error as { code?: string }).code ?? (error as Error).name ?? "network error";
    throw new ProviderError(providerId, `request failed (${code})`);
  }

  if (!response.ok) {
    const requestId = safeRequestId(response.headers.get("x-request-id"));
    throw new ProviderError(
      providerId,
      `HTTP ${response.status}${requestId ? ` (request ${requestId})` : ""}`,
      response.status,
    );
  }

  const json = (await response.json()) as
    | SystemOneResponse
    | { success: boolean; result: SystemOneResponse; errors?: unknown[] };

  const payload = "result" in json ? json.result : json;
  if ("errors" in json && Array.isArray(json.errors) && json.errors.length > 0) {
    throw new ProviderError(providerId, "provider rejected the request");
  }

  const answer = payload.answers?.relevant;
  if (!answer || typeof answer.noul !== "number" || Number.isNaN(answer.noul)) {
    throw new ProviderError(providerId, "response did not include a relevance score");
  }

  const usage = payload.usage
    ? {
        input: Number(payload.usage.input_tokens ?? 0),
        output: Number(payload.usage.output_tokens ?? 0),
      }
    : null;

  return { noul: clamp01(answer.noul), model: payload.model ?? model, usage };
}

function safeRequestId(value: string | null): string | null {
  if (!value) return null;
  // Strict allow-list: no underscores or token prefixes.
  if (!/^[A-Za-z0-9-]{1,64}$/.test(value)) return null;
  return value;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

async function callChoice(
  providerId: string,
  url: string,
  headers: Record<string, string>,
  model: string,
  query: string,
  options: ChooseOption[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ChooseResult> {
  const body = {
    model,
    state: {
      question: query,
      directories: options.map((option) => ({ id: option.id, description: option.label })),
    },
    questions: {
      directory: {
        type: "choice",
        instructions:
          "Which directory most likely contains files relevant to the developer's query? " +
          "Choose from the supplied directories only.",
        criteria: Object.fromEntries(options.map((option) => [option.id, option.label])),
      },
    },
  };

  const signals = [AbortSignal.timeout(Math.max(1, timeoutMs))];
  if (signal) signals.push(signal);

  let response: Response;
  try {
    response = await fetchImplRef.current(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.any(signals),
    });
  } catch (error) {
    if (signal?.aborted) throw new ProviderError(providerId, "cancelled");
    const code = (error as { code?: string }).code ?? (error as Error).name ?? "network error";
    throw new ProviderError(providerId, `request failed (${code})`);
  }

  if (!response.ok) {
    const requestId = safeRequestId(response.headers.get("x-request-id"));
    throw new ProviderError(
      providerId,
      `HTTP ${response.status}${requestId ? ` (request ${requestId})` : ""}`,
      response.status,
    );
  }

  const json = (await response.json()) as
    | { model: string; answers: Record<string, { choice?: string; probabilities?: Record<string, number> }>; usage?: { input_tokens?: number; output_tokens?: number } }
    | { success: boolean; result: { model: string; answers: Record<string, { choice?: string; probabilities?: Record<string, number> }>; usage?: { input_tokens?: number; output_tokens?: number } }; errors?: unknown[] };

  const payload = "result" in json ? json.result : json;
  if ("errors" in json && Array.isArray(json.errors) && json.errors.length > 0) {
    throw new ProviderError(providerId, "provider rejected the request");
  }
  const answer = payload.answers?.directory;
  const ids = new Set(options.map((option) => option.id));
  const choice = answer?.choice && ids.has(answer.choice) ? answer.choice : null;
  const probabilities: Record<string, number> = {};
  for (const [key, value] of Object.entries(answer?.probabilities ?? {})) {
    if (ids.has(key) && typeof value === "number") probabilities[key] = value;
  }

  const usage = payload.usage
    ? { input: Number(payload.usage.input_tokens ?? 0), output: Number(payload.usage.output_tokens ?? 0) }
    : null;

  return { choice, probabilities, usage, model: payload.model ?? model };
}

const fetchImplRef: { current: typeof fetch } = { current: fetch };

async function scoreCandidates(
  providerId: "jev" | "clef",
  prompt: { instructions: string; criteria: { true: string; false: string } },
  model: string,
  endpoint: (candidateIndex: number) => string,
  headers: Record<string, string>,
  query: string,
  candidates: ScoreCandidate[],
  options: ScoreOptions,
): Promise<ScoreResult> {
  const scores: Record<string, number> = {};
  let usage: { input: number; output: number } | null = null;
  let usageSeen = false;
  let actualModel = model;
  let failures = 0;
  let skipped = 0;
  let firstError: Error | null = null;

  await mapWithConcurrency(candidates, options.concurrency, async (candidate, index) => {
    if (options.signal?.aborted || Date.now() >= options.deadline) {
      skipped += 1;
      return;
    }
    const remaining = options.deadline - Date.now();
    const requestTimeout = options.requestTimeoutMs ?? (providerId === "jev" ? 30_000 : 8000);
    try {
      const result = await callSystemOne(
        providerId,
        endpoint(index),
        headers,
        model,
        query,
        candidate,
        Math.min(remaining, requestTimeout),
        options.signal,
        fetchImplRef.current,
        prompt,
      );
      scores[candidate.id] = result.noul;
      actualModel = result.model;
      if (result.usage) {
        usageSeen = true;
        usage = {
          input: (usage?.input ?? 0) + result.usage.input,
          output: (usage?.output ?? 0) + result.usage.output,
        };
      }
    } catch (error) {
      failures += 1;
      if (!firstError) firstError = error as Error;
    }
  });

  if (failures > 0 && Object.keys(scores).length === 0) {
    throw firstError ?? new ProviderError(providerId, "all scoring requests failed");
  }

  return {
    scores,
    usage: usageSeen ? usage : null,
    model: actualModel,
    skipped: skipped + failures,
  };
}

export interface JevConfig {
  apiKey: string;
  model?: string;
  /** Internal test seam; production always uses the fixed TypeSafe endpoint. */
  baseUrl?: string;
  /** Internal test seam for mocked transports. */
  fetchImpl?: typeof fetch;
  /** Internal comparison seam for the locator-contract prompt evaluation. */
  promptVariant?: "legacy" | "locator";
}

export function createJevProvider(config: JevConfig): DecisionProvider {
  const baseUrl = (config.baseUrl ?? "https://api.typesafe.ai").replace(/\/+$/, "");
  const model = config.model ?? "jev-latest";
  const endpoint = `${baseUrl}/v1/systemone`;
  return {
    id: "jev",
    model,
    choose(query, options, opts) {
      return callChoice("jev", endpoint, { authorization: `Bearer ${config.apiKey}` }, model, query, options, Math.min(opts.deadline - Date.now(), 30_000), opts.signal);
    },
    score(query, candidates, options) {
      fetchImplRef.current = config.fetchImpl ?? fetch;
      return scoreCandidates(
        "jev",
        config.promptVariant === "legacy"
          ? { instructions: RELEVANCE_INSTRUCTIONS_LEGACY, criteria: RELEVANCE_CRITERIA_LEGACY }
          : { instructions: RELEVANCE_INSTRUCTIONS, criteria: RELEVANCE_CRITERIA },
        model,
        () => `${baseUrl}/v1/systemone`,
        { authorization: `Bearer ${config.apiKey}` },
        query,
        candidates,
        options,
      );
    },
  };
}

export interface ClefConfig {
  apiToken: string;
  accountId: string;
  model?: string;
  baseUrl?: string;
}

export function createClefProvider(config: ClefConfig): DecisionProvider {
  const model = config.model ?? "clef-flash";
  const baseUrl = (config.baseUrl ?? "https://api.cloudflare.com/client/v4").replace(/\/+$/, "");
  const modelPath = model.startsWith("@cf/") ? model : `@cf/cloudflare/${model}`;
  const endpoint = `${baseUrl}/accounts/${config.accountId}/ai/run/${modelPath}`;
  const selector = modelPath.split("/").at(-1) ?? "clef-flash";
  return {
    id: "clef",
    model: selector,
    maxCandidates: 12,
    choose(query, options, opts) {
      return callChoice("clef", endpoint, { authorization: `Bearer ${config.apiToken}` }, selector, query, options, Math.min(opts.deadline - Date.now(), 8000), opts.signal);
    },
    score(query, candidates, options) {
      return scoreCandidates(
        "clef",
        { instructions: RELEVANCE_INSTRUCTIONS, criteria: RELEVANCE_CRITERIA },
        selector,
        () => endpoint,
        { authorization: `Bearer ${config.apiToken}` },
        query,
        candidates,
        options,
      );
    },
  };
}
