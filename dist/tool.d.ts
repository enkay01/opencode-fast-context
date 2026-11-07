import { type FastContextConfig, type ProviderOverrides } from "./config.ts";
import type { SearchResult } from "./types.ts";
export type AuthRequestReason = "missing" | "expired";
export type AuthRequestOutcome = "saved" | "cancelled" | "unavailable";
/**
 * Credential access for one search run. Implemented by the plugin entry point
 * on top of OpenCode's integration credential store and the TUI auth prompt.
 */
export interface CredentialBroker {
    /** Resolves the persisted (non-environment) API key, if any. */
    resolveStored(): Promise<string | undefined>;
    /**
     * Asks an interactive client for a key. Resolves "saved" after a verified
     * key was persisted, "cancelled" when the user dismissed the prompt, and
     * "unavailable" when no interactive client can prompt.
     */
    requestAuth?(reason: AuthRequestReason, signal?: AbortSignal): Promise<AuthRequestOutcome>;
}
export interface RunOptions {
    root: string;
    query: string;
    maxFiles?: number;
    config?: FastContextConfig;
    /** Internal test seam. Never populated from plugin options. */
    overrides?: ProviderOverrides;
    signal?: AbortSignal;
    /** Credential store and interactive prompt bridge; absent means env-only. */
    credentials?: CredentialBroker;
}
export declare function runFastContext(options: RunOptions): Promise<SearchResult>;
export declare function readAutoInvoke(config: FastContextConfig | undefined): "suggest" | "off";
export declare const TOOL_DESCRIPTION: string;
export declare const TOOL_INPUT_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["query"];
    readonly properties: {
        readonly query: {
            readonly type: "string";
            readonly minLength: 2;
            readonly description: string;
        };
        readonly maxFiles: {
            readonly type: "integer";
            readonly minimum: 1;
            readonly maximum: 20;
            readonly description: string;
        };
    };
};
export declare function formatForModel(result: SearchResult): string;
