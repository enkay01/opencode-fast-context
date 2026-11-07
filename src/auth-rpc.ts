import { Rpc } from "@opencode/plugin";

const EMPTY_OBJECT = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

const OK_OUTPUT = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
} as const;

/**
 * Typed contract between the Fast Context server part and its TUI part.
 * The server registers these methods and emits `request` events when a
 * search needs a credential; the TUI answers prompts and lifecycle calls.
 */
export const FastContextAuthRpc = Rpc.define({
  id: "fast-context",
  methods: {
    /** Marks an interactive TUI client as attached so the server may prompt. */
    attach: {
      input: EMPTY_OBJECT,
      output: EMPTY_OBJECT,
    },
    /** Marks the TUI client as gone. */
    detach: {
      input: EMPTY_OBJECT,
      output: EMPTY_OBJECT,
    },
    /** Credential presence by source; never returns secret material. */
    status: {
      input: EMPTY_OBJECT,
      output: {
        type: "object",
        properties: {
          env: { type: "boolean" },
          stored: { type: "boolean" },
        },
        required: ["env", "stored"],
        additionalProperties: false,
      },
    },
    /**
     * Verifies a candidate key against TypeSafe, persists it through the
     * integration credential store, and resolves any pending auth request.
     * Returns ok:false with a user-safe error when verification fails.
     */
    submitKey: {
      input: {
        type: "object",
        properties: {
          requestId: { type: "string" },
          key: { type: "string", minLength: 1, maxLength: 512 },
        },
        required: ["key"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          error: { type: "string" },
        },
        required: ["ok"],
        additionalProperties: false,
      },
    },
    /** Cancels a pending auth request so the waiting search can fall back. */
    cancel: {
      input: {
        type: "object",
        properties: { requestId: { type: "string" } },
        required: ["requestId"],
        additionalProperties: false,
      },
      output: OK_OUTPUT,
    },
  },
  events: {
    /** Server asks a connected TUI to collect a credential. */
    request: {
      schema: {
        type: "object",
        properties: {
          requestId: { type: "string" },
          reason: { type: "string", enum: ["missing", "expired"] },
        },
        required: ["requestId", "reason"],
        additionalProperties: false,
      },
    },
  },
});

export type AuthRequestReason = "missing" | "expired";

export interface AuthStatus {
  env: boolean;
  stored: boolean;
}

export interface SubmitKeyResult {
  ok: boolean;
  error?: string;
}
