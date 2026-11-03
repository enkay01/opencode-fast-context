import { ProviderError, RELEVANCE_CRITERIA, RELEVANCE_INSTRUCTIONS, buildState, mapWithConcurrency, } from "./types.js";
async function callSystemOne(providerId, url, headers, model, query, candidate, timeoutMs, signal) {
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
        response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: JSON.stringify(body),
            signal: AbortSignal.any(signals),
        });
    }
    catch (error) {
        if (signal?.aborted)
            throw new ProviderError(providerId, "cancelled");
        throw new ProviderError(providerId, `request failed: ${error.message}`);
    }
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new ProviderError(providerId, `HTTP ${response.status}: ${text.slice(0, 240)}`, response.status);
    }
    const json = (await response.json());
    const payload = "result" in json ? json.result : json;
    if ("errors" in json && Array.isArray(json.errors) && json.errors.length > 0) {
        throw new ProviderError(providerId, `provider errors: ${JSON.stringify(json.errors).slice(0, 240)}`);
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
function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}
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
            const result = await callSystemOne(providerId, endpoint(index), headers, model, query, candidate, Math.min(remaining, 8000), options.signal);
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
    return {
        id: "jev",
        model,
        score(query, candidates, options) {
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
        score(query, candidates, options) {
            return scoreCandidates("clef", selector, () => endpoint, { authorization: `Bearer ${config.apiToken}` }, query, candidates, options);
        },
    };
}
//# sourceMappingURL=systemone.js.map