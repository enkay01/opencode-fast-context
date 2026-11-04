import { ProviderError, RELEVANCE_CRITERIA, RELEVANCE_INSTRUCTIONS, buildState, mapWithConcurrency, } from "./types.js";
async function callSystemOne(providerId, url, headers, model, query, candidate, timeoutMs, signal, fetchImpl = fetch) {
    const body = {
        model,
        state: buildState(query, candidate),
        questions: {
            relevant: {
                type: "noul",
                instructions: RELEVANCE_INSTRUCTIONS,
                criteria: RELEVANCE_CRITERIA,
            },
        },
    };
    const signals = [AbortSignal.timeout(Math.max(1, timeoutMs))];
    if (signal)
        signals.push(signal);
    let response;
    try {
        response = await fetchImplRef.current(url, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: JSON.stringify(body),
            signal: AbortSignal.any(signals),
        });
    }
    catch (error) {
        if (signal?.aborted)
            throw new ProviderError(providerId, "cancelled");
        const code = error.code ?? error.name ?? "network error";
        throw new ProviderError(providerId, `request failed (${code})`);
    }
    if (!response.ok) {
        const requestId = safeRequestId(response.headers.get("x-request-id"));
        throw new ProviderError(providerId, `HTTP ${response.status}${requestId ? ` (request ${requestId})` : ""}`, response.status);
    }
    const json = (await response.json());
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
function safeRequestId(value) {
    if (!value)
        return null;
    // Strict allow-list: no underscores or token prefixes.
    if (!/^[A-Za-z0-9-]{1,64}$/.test(value))
        return null;
    return value;
}
function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}
async function callChoice(providerId, url, headers, model, query, options, timeoutMs, signal) {
    const body = {
        model,
        state: {
            question: query,
            directories: options.map((option) => ({ id: option.id, description: option.label })),
        },
        questions: {
            directory: {
                type: "choice",
                instructions: "Which directory most likely contains the code that answers the developer's question? " +
                    "Choose from the supplied directories only.",
                criteria: Object.fromEntries(options.map((option) => [option.id, option.label])),
            },
        },
    };
    const signals = [AbortSignal.timeout(Math.max(1, timeoutMs))];
    if (signal)
        signals.push(signal);
    let response;
    try {
        response = await fetchImplRef.current(url, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: JSON.stringify(body),
            signal: AbortSignal.any(signals),
        });
    }
    catch (error) {
        if (signal?.aborted)
            throw new ProviderError(providerId, "cancelled");
        const code = error.code ?? error.name ?? "network error";
        throw new ProviderError(providerId, `request failed (${code})`);
    }
    if (!response.ok) {
        const requestId = safeRequestId(response.headers.get("x-request-id"));
        throw new ProviderError(providerId, `HTTP ${response.status}${requestId ? ` (request ${requestId})` : ""}`, response.status);
    }
    const json = (await response.json());
    const payload = "result" in json ? json.result : json;
    if ("errors" in json && Array.isArray(json.errors) && json.errors.length > 0) {
        throw new ProviderError(providerId, "provider rejected the request");
    }
    const answer = payload.answers?.directory;
    const ids = new Set(options.map((option) => option.id));
    const choice = answer?.choice && ids.has(answer.choice) ? answer.choice : null;
    const probabilities = {};
    for (const [key, value] of Object.entries(answer?.probabilities ?? {})) {
        if (ids.has(key) && typeof value === "number")
            probabilities[key] = value;
    }
    const usage = payload.usage
        ? { input: Number(payload.usage.input_tokens ?? 0), output: Number(payload.usage.output_tokens ?? 0) }
        : null;
    return { choice, probabilities, usage, model: payload.model ?? model };
}
const fetchImplRef = { current: fetch };
async function scoreCandidates(providerId, model, endpoint, headers, query, candidates, options) {
    const scores = {};
    let usage = null;
    let usageSeen = false;
    let actualModel = model;
    let failures = 0;
    let skipped = 0;
    let firstError = null;
    await mapWithConcurrency(candidates, options.concurrency, async (candidate, index) => {
        if (options.signal?.aborted || Date.now() >= options.deadline) {
            skipped += 1;
            return;
        }
        const remaining = options.deadline - Date.now();
        try {
            const result = await callSystemOne(providerId, endpoint(index), headers, model, query, candidate, Math.min(remaining, 8000), options.signal, fetchImplRef.current);
            scores[candidate.id] = result.noul;
            actualModel = result.model;
            if (result.usage) {
                usageSeen = true;
                usage = {
                    input: (usage?.input ?? 0) + result.usage.input,
                    output: (usage?.output ?? 0) + result.usage.output,
                };
            }
        }
        catch (error) {
            failures += 1;
            if (!firstError)
                firstError = error;
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
export function createJevProvider(config) {
    const baseUrl = (config.baseUrl ?? "https://api.typesafe.ai").replace(/\/+$/, "");
    const model = config.model ?? "jev-latest";
    const endpoint = `${baseUrl}/v1/systemone`;
    return {
        id: "jev",
        model,
        choose(query, options, opts) {
            return callChoice("jev", endpoint, { authorization: `Bearer ${config.apiKey}` }, model, query, options, Math.min(opts.deadline - Date.now(), 8000), opts.signal);
        },
        score(query, candidates, options) {
            fetchImplRef.current = config.fetchImpl ?? fetch;
            return scoreCandidates("jev", model, () => `${baseUrl}/v1/systemone`, { authorization: `Bearer ${config.apiKey}` }, query, candidates, options);
        },
    };
}
export function createClefProvider(config) {
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
            return scoreCandidates("clef", selector, () => endpoint, { authorization: `Bearer ${config.apiToken}` }, query, candidates, options);
        },
    };
}
