import type { DecisionProvider } from "./providers/types.ts";
import { type AutoInvoke } from "./guidance.ts";
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
export declare function readPublicConfig(options: Record<string, unknown> | undefined): FastContextConfig;
export declare function resolveProvider(env?: NodeJS.ProcessEnv, overrides?: ProviderOverrides): ProviderResolution;
