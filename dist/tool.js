import { resolveProvider } from "./config.js";
import { searchRepository } from "./engine/search.js";
import { normalizeAutoInvoke } from "./guidance.js";
export async function runFastContext(options) {
    const config = options.config ?? { autoInvoke: "suggest" };
    const resolution = resolveProvider(process.env, options.overrides ?? {});
    if (!resolution.provider) {
        return {
            version: 1,
            query: options.query,
            status: "fallback_required",
            results: [],
            truncated: false,
            candidateCount: 0,
            provider: { id: "none", model: null, usage: null },
            timings: { discovery: 0, ranking: 0, total: 0 },
            reason: resolution.error ?? "Jev is not configured",
        };
    }
    return searchRepository({
        root: options.root,
        query: options.query,
        ...(options.maxFiles ? { maxFiles: options.maxFiles } : {}),
        provider: resolution.provider,
        ...(options.signal ? { signal: options.signal } : {}),
    });
}
export function readAutoInvoke(config) {
    return normalizeAutoInvoke(config?.autoInvoke);
}
export const TOOL_DESCRIPTION = "Find the files and line ranges in this repository that answer a code question. " +
    "Runs bounded local search, ranks candidates with Jev, and returns compact verified citations. " +
    "Use it before broad iterative search when you need to locate behavior across files. " +
    "If it reports no_match or fallback_required, continue with the ordinary search tools.";
export const TOOL_INPUT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
        query: {
            type: "string",
            minLength: 2,
            description: "The code question or behavior to locate, in plain language or with identifiers.",
        },
        maxFiles: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            description: "Maximum number of files to return. Defaults to the configured limit.",
        },
    },
};
export function formatForModel(result) {
    const provider = result.provider.id === "none" ? "local ranking" : `${result.provider.id}:${result.provider.model}`;
    const header = [
        `status: ${result.status}`,
        `provider: ${provider}`,
        `files: ${result.results.length}/${result.candidateCount} candidates`,
        `time: ${result.timings.total}ms (discovery ${result.timings.discovery}ms, ranking ${result.timings.ranking}ms)`,
    ];
    if (result.reason)
        header.push(`reason: ${result.reason}`);
    if (result.truncated)
        header.push("truncated: true");
    if (result.results.length === 0) {
        return `${header.join("\n")}\n\nNo verified evidence. Use the normal search tools.`;
    }
    const body = result.results.map((evidence, index) => {
        const ranges = evidence.ranges.map((range) => `${range.start}-${range.end}`).join(", ");
        const scores = evidence.scores.decision === null
            ? `lexical ${evidence.scores.lexical}`
            : `decision ${evidence.scores.decision}, lexical ${evidence.scores.lexical}`;
        return `${index + 1}. ${evidence.path}:${ranges}  (${scores})\n${indent(excerptLines(evidence.excerpt, 6))}`;
    });
    const footer = result.status === "fallback_required"
        ? "\nThe decision provider failed. These are unranked lexical candidates; continue with the normal search tools."
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
