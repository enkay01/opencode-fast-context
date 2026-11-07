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
            error: "TYPESAFE_API_KEY is not set and no Fast Context credential is stored in OpenCode. " +
                "Set TYPESAFE_API_KEY in the environment, or run /fast-context auth in an interactive " +
                "OpenCode session to store a key. Fast Context does not fall back to local ranking.",
        };
    }
    return {
        provider: createJevProvider({
            apiKey,
            ...(overrides.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
            ...(overrides.endpoint ? { baseUrl: overrides.endpoint } : {}),
        }),
        error: null,
        source: "env",
    };
}
/**
 * Resolves the provider asynchronously with the full credential precedence:
 * `process.env.TYPESAFE_API_KEY` first, then the OpenCode integration
 * credential store, then nothing. The environment key always wins; a stored
 * key is only consulted when no environment key exists, so an explicit env
 * override can never be shadowed or deleted by store state.
 */
export async function resolveProviderAsync(env = process.env, overrides = {}, resolveStoredKey) {
    const fromEnv = resolveProvider(env, overrides);
    if (fromEnv.provider)
        return fromEnv;
    const storedKey = resolveStoredKey ? await resolveStoredKey() : undefined;
    if (!storedKey)
        return fromEnv;
    return {
        provider: createJevProvider({
            apiKey: storedKey,
            ...(overrides.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
            ...(overrides.endpoint ? { baseUrl: overrides.endpoint } : {}),
        }),
        error: null,
        source: "store",
    };
}
