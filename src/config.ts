import { createJevProvider } from "./providers/systemone.ts";
import type { DecisionProvider } from "./providers/types.ts";
import { normalizeAutoInvoke, type AutoInvoke } from "./guidance.ts";

/** Public V1 configuration. Anything else is ignored. */
export interface FastContextConfig {
  /**
   * "suggest" adds one session-context instruction telling the model when to call
   * `fast_context_search`; "off" adds nothing. Neither mode calls a provider.
   */
  autoInvoke?: AutoInvoke;
}

export interface ProviderResolution {
  provider: DecisionProvider | null;
  /** Set when Jev cannot be configured. Never contains credential material. */
  error: string | null;
}

/** Internal test seam; never exposed through plugin options. */
export interface ProviderOverrides {
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

export function readPublicConfig(options: Record<string, unknown> | undefined): FastContextConfig {
  const config: FastContextConfig = { autoInvoke: normalizeAutoInvoke(options?.autoInvoke) };
  return config;
}

export function resolveProvider(
  env: NodeJS.ProcessEnv = process.env,
  overrides: ProviderOverrides = {},
): ProviderResolution {
  const apiKey = env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return {
      provider: null,
      error:
        "TYPESAFE_API_KEY is not set. Provide it through your shell or secret manager before starting " +
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
