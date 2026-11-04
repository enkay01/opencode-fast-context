export class ProviderError extends Error {
    providerId;
    status;
    constructor(providerId, message, status = null) {
        super(message);
        this.name = "ProviderError";
        this.providerId = providerId;
        this.status = status;
    }
}
export const RELEVANCE_INSTRUCTIONS = "Does this code snippet provide direct evidence that answers the developer's question? " +
    "Judge whether the code implements, defines, or explains the behavior asked about. " +
    "A snippet that only shares words or topic is not evidence.";
export const RELEVANCE_CRITERIA = {
    true: "The snippet implements, defines, calls, or directly documents the specific behavior named in the question, " +
        "so a developer reading it would learn how that behavior works.",
    false: "The snippet is unrelated, or only mentions similar words, imports, tests, or configuration without showing the behavior asked about.",
};
export function buildState(query, candidate) {
    return {
        question: query,
        candidate: {
            path: candidate.path,
            code: truncate(candidate.code, 4000),
        },
    };
}
export function truncate(text, maxChars) {
    if (text.length <= maxChars)
        return text;
    return `${text.slice(0, maxChars)}\n… truncated`;
}
export async function mapWithConcurrency(items, concurrency, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (true) {
            const index = next;
            next += 1;
            if (index >= items.length)
                return;
            results[index] = await fn(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}
