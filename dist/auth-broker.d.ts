import type { AuthRequestOutcome, AuthRequestReason, CredentialBroker } from "./tool.ts";
/** A pending prompt is abandoned after this long so a search can never hang. */
export declare const DEFAULT_AUTH_REQUEST_TIMEOUT_MS = 120000;
export interface AuthRequestEvent {
    requestId: string;
    reason: AuthRequestReason;
}
export interface AuthBrokerOptions {
    /** Resolves the persisted API key. */
    resolveStored: () => Promise<string | undefined>;
    /** Resolves the active stored credential ID, used for cleanup. */
    activeCredentialID?: () => Promise<string | undefined>;
    timeoutMs?: number;
}
export interface AuthBroker {
    readonly broker: CredentialBroker;
    /** Registers the sessions an interactive client is showing. */
    attach: (sessions: readonly string[]) => {
        remove: readonly string[];
    };
    detach: () => void;
    /** Marks rejected credential IDs as removed so attach stops returning them. */
    acknowledge: (credentialIDs: readonly string[]) => void;
    /** Drops every queued rejection after a verified replacement is stored. */
    clearRejected: () => void;
    settle: (requestId: string, outcome: AuthRequestOutcome) => {
        ok: true;
    };
    setEmit: (emit: (event: AuthRequestEvent) => Promise<void>) => void;
    dispose: () => void;
    pendingCount: () => number;
}
/**
 * Server-side bridge between fast_context_search and an interactive TUI.
 *
 * A search may only prompt when its own session is shown by an attached
 * client. Headless runs and subagent sessions are not attached, so they return
 * "unavailable" immediately instead of waiting on an unrelated window.
 */
export declare function createAuthBroker(options: AuthBrokerOptions): AuthBroker;
