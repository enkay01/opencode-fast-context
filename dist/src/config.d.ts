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
export declare function resolveProvider(config: FastContextConfig, env?: NodeJS.ProcessEnv): ProviderResolution;
