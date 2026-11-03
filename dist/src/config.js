import { createClefProvider, createJevProvider } from "./providers/systemone.js";
export function resolveProvider(config, env = process.env) {
    const kind = config.provider ?? env.FAST_CONTEXT_PROVIDER ?? "none";
    if (kind === "none")
        return { provider: null, error: null };
    if (kind === "jev") {
        const apiKey = env.TYPESAFE_API_KEY;
        if (!apiKey) {
            return { provider: null, error: "TYPESAFE_API_KEY is not set" };
        }
        return {
            provider: createJevProvider({
                apiKey,
                ...(config.model ? { model: config.model } : {}),
                ...(env.TYPESAFE_ENDPOINT ? { baseUrl: env.TYPESAFE_ENDPOINT } : {}),
            }),
            error: null,
        };
    }
    const apiToken = env.CLOUDFLARE_AI_API_TOKEN ?? env.CLOUDFLARE_API_TOKEN;
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    if (!apiToken) {
        return { provider: null, error: "CLOUDFLARE_API_TOKEN is not set" };
    }
    if (!accountId) {
        return { provider: null, error: "CLOUDFLARE_ACCOUNT_ID is not set" };
    }
    return {
        provider: createClefProvider({
            apiToken,
            accountId,
            ...(config.model ? { model: config.model } : {}),
            ...(env.CLOUDFLARE_AI_BASE_URL ? { baseUrl: env.CLOUDFLARE_AI_BASE_URL } : {}),
        }),
        error: null,
    };
}
//# sourceMappingURL=config.js.map