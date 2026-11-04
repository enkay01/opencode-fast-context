import { createJevProvider } from "./providers/systemone.js";
import { normalizeAutoInvoke } from "./guidance.js";
export function readPublicConfig(options) {
    const config = { autoInvoke: normalizeAutoInvoke(options?.autoInvoke) };
    return config;
}
export function resolveProvider(env = process.env, overrides = {}) {
    const apiKey = env.TYPESAFE_API_KEY;
    if (!apiKey) {
        return {
            provider: null,
            error: "TYPESAFE_API_KEY is not set. Provide it through your shell or secret manager before starting " +
                "OpenCode. Fast Context does not fall back to local ranking.",
        };
    }
    return {
        provider: createJevProvider({
            apiKey,
            ...(overrides.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
            ...(overrides.endpoint ? { baseUrl: overrides.endpoint } : {}),
        }),
        error: null,
    };
}
