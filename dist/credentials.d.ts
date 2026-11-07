import type { ProviderOverrides } from "./config.ts";
/** Integration ID under which Fast Context stores the TypeSafe / Jev key. */
export declare const FAST_CONTEXT_INTEGRATION_ID = "fast-context";
export declare const FAST_CONTEXT_INTEGRATION_NAME = "Fast Context (TypeSafe Jev)";
/** Minimal structural view of the pieces of `ctx.integration` this module needs. */
export interface IntegrationCredentialApi {
    transform: (callback: (editor: IntegrationEditorLike) => void) => Promise<{
        dispose(): Promise<void>;
    }>;
    connection: {
        active: (integrationID: string) => Promise<IntegrationConnectionLike | undefined>;
        resolve: (connection: IntegrationConnectionLike) => Promise<IntegrationCredentialValueLike | undefined>;
    };
    connect: {
        key: (input: {
            integrationID: string;
            key: string;
            label?: string;
        }) => Promise<unknown>;
    };
}
export interface IntegrationEditorLike {
    update: (id: string, update: (integration: {
        id: string;
        name: string;
    }) => void) => void;
    method: {
        update: (input: {
            integrationID: string;
            method: {
                type: "key";
                label?: string;
            } | {
                type: "env";
                names: string[];
            };
        }) => void;
    };
}
export interface IntegrationConnectionLike {
    type: string;
    id?: string;
    name?: string;
}
export interface IntegrationCredentialValueLike {
    type: string;
    key?: string;
}
export interface RegistrationLike {
    dispose: () => Promise<void>;
}
/**
 * Registers the Fast Context integration and its key method so OpenCode's
 * credential store accepts and resolves TypeSafe keys for this plugin.
 */
export declare function registerFastContextIntegration(integration: IntegrationCredentialApi): Promise<RegistrationLike>;
/** Returns the active stored key, or undefined when none resolves to a key credential. */
export declare function resolveStoredApiKey(integration: IntegrationCredentialApi): Promise<string | undefined>;
/** Whether any credential connection is active for the Fast Context integration. */
export declare function hasStoredCredential(integration: IntegrationCredentialApi): Promise<boolean>;
/** Persists a validated key through OpenCode's integration credential store. */
export declare function storeApiKey(integration: IntegrationCredentialApi, apiKey: string): Promise<void>;
export type KeyVerification = "valid" | "invalid" | "unverified";
export interface VerifyOptions extends ProviderOverrides {
    signal?: AbortSignal;
    timeoutMs?: number;
}
/**
 * Probes the TypeSafe API with the candidate key before it is persisted.
 * GET /v1/models is the documented lightweight discovery endpoint: a 2xx
 * proves the key works, 401/403 proves it does not, and anything else
 * (network failure, timeout, unexpected status) is "unverified".
 */
export declare function verifyApiKey(apiKey: string, options?: VerifyOptions): Promise<KeyVerification>;
export declare function verificationErrorMessage(result: Exclude<KeyVerification, "valid">): string;
/** Structural view of a client credential entry; matches OpenCode's CredentialEntry. */
export interface CredentialEntryLike {
    id: string;
    integrationID: string;
    active: boolean;
}
/** Fast Context records within a `credential.list()` result; other integrations are ignored. */
export declare function fastContextCredentialEntries<T extends CredentialEntryLike>(entries: readonly T[]): T[];
/**
 * Records a replacement should remove: every Fast Context credential except
 * the one that stays active (the active entry, or the first when none is
 * marked active). connect.key appends records, so duplicates must be pruned
 * explicitly through `credential.remove`.
 */
export declare function replacementRemoval<T extends CredentialEntryLike>(entries: readonly T[]): T[];
