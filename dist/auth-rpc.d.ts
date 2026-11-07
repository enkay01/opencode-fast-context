/**
 * Typed contract between the Fast Context server part and its TUI part.
 * The server registers these methods and emits `request` events when a
 * search needs a credential; the TUI answers prompts and lifecycle calls.
 */
export declare const FastContextAuthRpc: {
    readonly id: "fast-context";
    readonly methods: {
        /** Marks an interactive TUI client as attached so the server may prompt. */
        readonly attach: {
            readonly input: {
                readonly type: "object";
                readonly properties: {};
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {};
                readonly additionalProperties: false;
            };
        };
        /** Marks the TUI client as gone. */
        readonly detach: {
            readonly input: {
                readonly type: "object";
                readonly properties: {};
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {};
                readonly additionalProperties: false;
            };
        };
        /** Credential presence by source; never returns secret material. */
        readonly status: {
            readonly input: {
                readonly type: "object";
                readonly properties: {};
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly env: {
                        readonly type: "boolean";
                    };
                    readonly stored: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["env", "stored"];
                readonly additionalProperties: false;
            };
        };
        /**
         * Verifies a candidate key against TypeSafe, persists it through the
         * integration credential store, and resolves any pending auth request.
         * Returns ok:false with a user-safe error when verification fails.
         */
        readonly submitKey: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly requestId: {
                        readonly type: "string";
                    };
                    readonly key: {
                        readonly type: "string";
                        readonly minLength: 1;
                        readonly maxLength: 512;
                    };
                };
                readonly required: readonly ["key"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly ok: {
                        readonly type: "boolean";
                    };
                    readonly error: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["ok"];
                readonly additionalProperties: false;
            };
        };
        /** Cancels a pending auth request so the waiting search can fall back. */
        readonly cancel: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly requestId: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["requestId"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly ok: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["ok"];
                readonly additionalProperties: false;
            };
        };
    };
    readonly events: {
        /** Server asks a connected TUI to collect a credential. */
        readonly request: {
            readonly schema: {
                readonly type: "object";
                readonly properties: {
                    readonly requestId: {
                        readonly type: "string";
                    };
                    readonly reason: {
                        readonly type: "string";
                        readonly enum: readonly ["missing", "expired"];
                    };
                };
                readonly required: readonly ["requestId", "reason"];
                readonly additionalProperties: false;
            };
        };
    };
};
export type AuthRequestReason = "missing" | "expired";
export interface AuthStatus {
    env: boolean;
    stored: boolean;
}
export interface SubmitKeyResult {
    ok: boolean;
    error?: string;
}
