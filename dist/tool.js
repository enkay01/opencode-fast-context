import { resolveProviderAsync, } from "./config.js";
import { searchRepository } from "./engine/search.js";
import { normalizeAutoInvoke } from "./guidance.js";
import { ProviderError } from "./providers/types.js";
const AUTH_FAILURE_STATUSES = new Set([401, 403]);
function isAuthFailure(error) {
    return error instanceof ProviderError && error.status !== null && AUTH_FAILURE_STATUSES.has(error.status);
}
/** Wraps a provider so the first HTTP 401/403 surfaces to the caller. */
function observeAuthFailures(provider, onAuthFailure) {
    const wrap = (fn) => async (...args) => {
        try {
            return await fn(...args);
        }
        catch (error) {
            if (isAuthFailure(error))
                onAuthFailure(error.status ?? 0);
            throw error;
        }
    };
    return {
        ...provider,
        score: wrap(provider.score.bind(provider)),
        ...(provider.choose ? { choose: wrap(provider.choose.bind(provider)) } : {}),
    };
}
function fallbackResult(query, reason) {
    return {
        version: 1,
        query,
        status: "fallback_required",
        results: [],
        truncated: false,
        candidateCount: 0,
        searched: { candidates: 0, files: 0, truncated: false },
        provider: { id: "none", model: null, usage: null },
        timings: { discovery: 0, ranking: 0, total: 0 },
        reason,
    };
}
function authFailureReason(source, status) {
    if (source === "env") {
        return (`TYPESAFE_API_KEY was rejected by TypeSafe (HTTP ${status}). ` +
            "Update the environment key; the stored OpenCode credential was left untouched.");
    }
    return (`The stored Fast Context credential was rejected by TypeSafe (HTTP ${status}). ` +
        "Run /fast-context auth in OpenCode to replace it.");
}
export async function runFastContext(options) {
    const config = options.config ?? { autoInvoke: "suggest" };
    const overrides = options.overrides ?? {};
    const credentials = options.credentials;
    const storedKey = () => credentials?.resolveStored() ?? Promise.resolve(undefined);
    const resolve = () => resolveProviderAsync(process.env, overrides, credentials ? storedKey : undefined);
    let resolution = await resolve();
    if (!resolution.provider && credentials?.requestAuth) {
        const outcome = await credentials.requestAuth("missing", options.signal, options.sessionID);
        if (outcome === "saved") {
            resolution = await resolve();
        }
    }
    if (!resolution.provider) {
        return fallbackResult(options.query, resolution.error ?? "Jev is not configured");
    }
    const runSearch = async (provider, onAuthFailure) => searchRepository({
        root: options.root,
        query: options.query,
        ...(options.maxFiles ? { maxFiles: options.maxFiles } : {}),
        provider: observeAuthFailures(provider, onAuthFailure),
        ...(options.signal ? { signal: options.signal } : {}),
    });
    let authStatus = null;
    const capture = (status) => {
        if (authStatus === null)
            authStatus = status;
    };
    let result = await runSearch(resolution.provider, capture);
    if (result.status === "fallback_required" && authStatus !== null && resolution.source === "store") {
        try {
            await credentials?.discardStored?.();
        }
        catch {
            // Cleanup is best effort; the fallback reason still tells the user.
        }
        if (credentials?.requestAuth) {
            const outcome = await credentials.requestAuth("expired", options.signal, options.sessionID);
            if (outcome === "saved") {
                const retry = await resolve();
                if (retry.provider) {
                    authStatus = null;
                    result = await runSearch(retry.provider, capture);
                    if (result.status === "fallback_required" && authStatus !== null) {
                        return { ...result, reason: authFailureReason(retry.source, authStatus) };
                    }
                    return result;
                }
            }
        }
    }
    if (result.status === "fallback_required" && authStatus !== null) {
        return { ...result, reason: authFailureReason(resolution.source, authStatus) };
    }
    return result;
}
export function readAutoInvoke(config) {
    return normalizeAutoInvoke(config?.autoInvoke);
}
export const TOOL_DESCRIPTION = "Retrieve relevant repository files and line ranges into context for the current task. " +
    "Use a focused query with domain names, symbols, or behavior; results contain ranked paths and bounded excerpts. " +
    "Read the selected ranges when more context is needed. For current project status or a missing artifact, " +
    "also inspect the relevant directories and version-control state. On no_match or fallback_required, " +
    "continue with ordinary search.";
export const TOOL_INPUT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
        query: {
            type: "string",
            minLength: 2,
            description: "The task, concepts, or identifiers whose relevant repository files should be retrieved. " +
                "Natural-language behavior queries are supported; naming the target file is not required.",
        },
        maxFiles: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            description: "Maximum number of files to return. This is a ceiling; fewer files may be returned. " +
                "Defaults to the configured limit.",
        },
    },
};
export function formatForModel(result) {
    const provider = result.provider.id === "none"
        ? result.status === "fallback_required"
            ? "not configured"
            : "none"
        : `${result.provider.id}:${result.provider.model}`;
    const header = [
        `status: ${result.status}`,
        `provider: ${provider}`,
        `files: ${result.results.length}/${result.candidateCount} candidates`,
        `searched: ${result.searched.candidates} candidate windows across ${result.searched.files} files` +
            (result.searched.truncated ? " (discovery truncated by deadline)" : ""),
        `time: ${result.timings.total}ms (discovery ${result.timings.discovery}ms, ranking ${result.timings.ranking}ms)`,
    ];
    if (result.reason)
        header.push(`reason: ${result.reason}`);
    if (result.truncated)
        header.push("truncated: true");
    if (result.results.length === 0) {
        return `${header.join("\n")}\n\nNo relevant evidence in the searched scope. This is not proof that no matching file exists; continue with ordinary search and check directories or version-control state when status matters.`;
    }
    const body = result.results.map((evidence, index) => {
        const ranges = evidence.ranges.map((range) => `${range.start}-${range.end}`).join(", ");
        const scores = evidence.scores.decision === null
            ? `lexical ${evidence.scores.lexical}`
            : `decision ${evidence.scores.decision}, lexical ${evidence.scores.lexical}`;
        return `${index + 1}. ${evidence.path}:${ranges}  (${scores})\n${indent(excerptLines(evidence.excerpt, 6))}`;
    });
    const footer = result.status === "fallback_required"
        ? "\nFast Context could not produce ranked evidence. Continue with the ordinary search tools."
        : "";
    return `${header.join("\n")}\n\n${body.join("\n\n")}${footer}`;
}
function excerptLines(excerpt, maxLines) {
    const lines = excerpt.split("\n");
    if (lines.length <= maxLines)
        return lines.join("\n");
    return `${lines.slice(0, maxLines).join("\n")}\n…`;
}
function indent(text) {
    return text
        .split("\n")
        .map((line) => `   ${line}`)
        .join("\n");
}
