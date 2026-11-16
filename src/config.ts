import { createJevProvider } from "./providers/systemone.ts";
import { createGeminiProvider } from "./providers/gemini.ts";
import type { DecisionProvider } from "./providers/types.ts";
import { normalizeAutoInvoke, type AutoInvoke } from "./guidance.ts";

/** Public V1 configuration. Anything else is ignored. */
export interface FastContextConfig {
  /**
   * "suggest" adds one session-context instruction telling the model when to call
   * `fast_context_search`; "off" adds nothing. Neither mode calls a provider.
   */
  autoInvoke?: AutoInvoke;
  decisionProvider?: "jev" | "gemini";
  /** Set by public option parsing so invalid selections fail before outbound work. */
  providerError?: string;
}

export type ProviderKind = "jev" | "gemini";

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
  if (options?.decisionProvider === undefined || options.decisionProvider === "jev") {
    config.decisionProvider = "jev";
  } else if (options.decisionProvider === "gemini") {
    config.decisionProvider = "gemini";
  } else {
    config.providerError = 'Invalid decisionProvider: use "jev" or "gemini".';
  }
  return config;
}

export function resolveProvider(
  env: NodeJS.ProcessEnv = process.env,
  overrides: ProviderOverrides = {},
  kind: ProviderKind = "jev",
): ProviderResolution {
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
export async function resolveProviderAsync(
  env: NodeJS.ProcessEnv = process.env,
  overrides: ProviderOverrides = {},
  resolveStoredKey?: () => Promise<string | undefined>,
  kind: ProviderKind = "jev",
): Promise<ProviderResolution> {
  const fromEnv = resolveProvider(env, overrides, kind);
  if (fromEnv.provider) return fromEnv;

  const storedKey = resolveStoredKey ? await resolveStoredKey() : undefined;
  if (!storedKey) return fromEnv;

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
