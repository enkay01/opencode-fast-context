import { createJevProvider } from "./providers/systemone.js";
import { createGeminiProvider } from "./providers/gemini.js";
import { normalizeAutoInvoke } from "./guidance.js";
export function readPublicConfig(options) {
    const config = { autoInvoke: normalizeAutoInvoke(options?.autoInvoke) };
    if (options?.decisionProvider === "jev") {
        config.decisionProvider = "jev";
    }
    else if (options?.decisionProvider === "gemini") {
        config.decisionProvider = "gemini";
    }
    else if (options?.decisionProvider !== undefined) {
        config.providerError = 'Invalid decisionProvider: use "jev" or "gemini".';
    }
    return config;
}
export function resolveProvider(env = process.env, overrides = {}, kind = "jev") {
    const apiKey = kind === "gemini" ? env.GEMINI_API_KEY : env.TYPESAFE_API_KEY;
    if (!apiKey) {
        return {
            provider: null,
            error: kind === "gemini"
                ? "GEMINI_API_KEY is not set and no Gemini credential is stored in OpenCode. Set GEMINI_API_KEY or run /fast-context auth in an interactive OpenCode session."
                : "TYPESAFE_API_KEY is not set and no Fast Context credential is stored in OpenCode. Set TYPESAFE_API_KEY in the environment, or run /fast-context auth in an interactive OpenCode session to store a key. Fast Context does not fall back to local ranking.",
        };
    }
    return {
        provider: kind === "gemini"
            ? createGeminiProvider({
                apiKey,
                ...(overrides.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
                ...(overrides.endpoint ? { endpoint: overrides.endpoint } : {}),
            })
            : createJevProvider({
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
export async function resolveProviderAsync(env = process.env, overrides = {}, resolveStoredKey, kind = "jev") {
    const fromEnv = resolveProvider(env, overrides, kind);
    if (fromEnv.provider)
        return fromEnv;
    const storedKey = resolveStoredKey ? await resolveStoredKey() : undefined;
    if (!storedKey)
        return fromEnv;
    return {
        provider: kind === "gemini"
            ? createGeminiProvider({
                apiKey: storedKey,
                ...(overrides.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
                ...(overrides.endpoint ? { endpoint: overrides.endpoint } : {}),
            })
            : createJevProvider({
                apiKey: storedKey,
                ...(overrides.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
                ...(overrides.endpoint ? { baseUrl: overrides.endpoint } : {}),
            }),
        error: null,
        source: "store",
    };
}
