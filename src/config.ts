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
  /** Which credential source supplied the key, when one did. */
  source?: "env" | "store";
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
        "TYPESAFE_API_KEY is not set and no Fast Context credential is stored in OpenCode. " +
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
export async function resolveProviderAsync(
  env: NodeJS.ProcessEnv = process.env,
  overrides: ProviderOverrides = {},
  resolveStoredKey?: () => Promise<string | undefined>,
): Promise<ProviderResolution> {
  const fromEnv = resolveProvider(env, overrides);
  if (fromEnv.provider) return fromEnv;

  const storedKey = resolveStoredKey ? await resolveStoredKey() : undefined;
  if (!storedKey) return fromEnv;

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
