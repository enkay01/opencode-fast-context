import { resolveProvider } from "./config.js";
import { searchRepository } from "./engine/search.js";
export async function runFastContext(options) {
    const config = options.config ?? {};
    const resolution = resolveProvider(config);
    const result = await searchRepository({
        root: options.root,
        query: options.query,
        ...(options.maxFiles ? { maxFiles: options.maxFiles } : {}),
        ...(config.deadlineMs ? { limits: { deadlineMs: config.deadlineMs } } : {}),
        provider: resolution.provider,
        ...(options.signal ? { signal: options.signal } : {}),
    });
    if (resolution.error && !result.reason) {
        result.status = "fallback_required";
        result.reason = `${resolution.error}; set it or choose another provider`;
    }
    return result;
}
export const TOOL_DESCRIPTION = "Find the files and line ranges in this repository that answer a code question. " +
    "Runs bounded local search, optionally ranks candidates with a decision model, and returns compact " +
    "verified citations. Use it before broad manual grep when you need to locate behavior across files. " +
    "If it reports fallback_required, continue with the normal search tools.";
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
//# sourceMappingURL=tool.js.map