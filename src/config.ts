import { createClefProvider, createJevProvider } from "./providers/systemone.ts";
import type { DecisionProvider } from "./providers/types.ts";

export type ProviderKind = "none" | "jev" | "clef";

export interface FastContextConfig {
  /** Which decision provider to rank with. Defaults to none (deterministic ranking). */
  provider?: ProviderKind;
  /** Override the default model for the selected provider. */
  model?: string;
  maxFiles?: number;
  deadlineMs?: number;
}

export interface ProviderResolution {
  provider: DecisionProvider | null;
  /** Set when a provider was requested but could not be configured. */
  error: string | null;
}

export function resolveProvider(
  config: FastContextConfig,
  env: NodeJS.ProcessEnv = process.env,
): ProviderResolution {
  const kind = config.provider ?? (env.FAST_CONTEXT_PROVIDER as ProviderKind | undefined) ?? "none";
  if (kind === "none") return { provider: null, error: null };

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
