import { randomUUID } from "node:crypto";
import { Plugin } from "@opencode/plugin";
import { FastContextAuthRpc } from "./auth-rpc.ts";
import { readPublicConfig } from "./config.ts";
import {
  hasStoredCredential,
  registerFastContextIntegration,
  resolveStoredApiKey,
  storeApiKey,
  verifyApiKey,
  verificationErrorMessage,
  type IntegrationCredentialApi,
} from "./credentials.ts";
import { applyAutoInvokeGuidance } from "./guidance.ts";
import {
  TOOL_DESCRIPTION,
  TOOL_INPUT_SCHEMA,
  formatForModel,
  runFastContext,
  type AuthRequestOutcome,
  type AuthRequestReason,
  type CredentialBroker,
} from "./tool.ts";

interface PendingAuthRequest {
  settle: (outcome: AuthRequestOutcome) => void;
}

/** Server-side bridge between fast_context_search and the TUI auth prompt. */
function createAuthBroker(ctx: Plugin.Context) {
  const integration = ctx.integration as unknown as IntegrationCredentialApi;
  const pending = new Map<string, PendingAuthRequest>();
  let tuiAttached = false;
  let emit: ((reason: AuthRequestReason, requestId: string) => Promise<void>) | null = null;

  const broker: CredentialBroker = {
    resolveStored: async () => {
      try {
        return await resolveStoredApiKey(integration);
      } catch {
        return undefined;
      }
    },
    requestAuth: async (reason, signal) => {
      if (!tuiAttached || !emit) return "unavailable";
      const requestId = randomUUID();
      const outcome = await new Promise<AuthRequestOutcome>((resolve) => {
        const finish = (value: AuthRequestOutcome) => {
          if (!pending.has(requestId)) return;
          pending.delete(requestId);
          signal?.removeEventListener("abort", onAbort);
          resolve(value);
        };
        const onAbort = () => finish("cancelled");
        if (signal) {
          if (signal.aborted) {
            resolve("cancelled");
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }
        pending.set(requestId, { settle: finish });
        void emit!(reason, requestId).catch(() => finish("unavailable"));
      });
      return outcome;
    },
  };

  const settle = (requestId: string, outcome: AuthRequestOutcome) => {
    pending.get(requestId)?.settle(outcome);
    return { ok: true };
  };

  return { broker, settle, setEmit: (fn: typeof emit) => (emit = fn), setTuiAttached: (value: boolean) => (tuiAttached = value) };
}

/** OpenCode 2 plugin entry point. */
export default Plugin.define({
  id: "fast-context",
  async setup(ctx: Plugin.Context) {
    const config = readPublicConfig(ctx.options as Record<string, unknown> | undefined);
    const root = ctx.location.project?.directory || ctx.location.directory;
    const auth = createAuthBroker(ctx);

    const integrationRegistration = await registerFastContextIntegration(
      ctx.integration as unknown as IntegrationCredentialApi,
    );

    const rpcRegistration = await ctx.rpc.register(FastContextAuthRpc, {
      attach: async () => {
        auth.setTuiAttached(true);
        return {};
      },
      detach: async () => {
        auth.setTuiAttached(false);
        return {};
      },
      status: async () => ({
        env: Boolean(process.env.TYPESAFE_API_KEY),
        stored: await hasStoredCredential(ctx.integration as unknown as IntegrationCredentialApi),
      }),
      submitKey: async (input) => {
        const { requestId, key } = input as { requestId?: string; key: string };
        const verification = await verifyApiKey(key);
        if (verification !== "valid") {
          return { ok: false, error: verificationErrorMessage(verification) };
        }
        try {
          await storeApiKey(ctx.integration as unknown as IntegrationCredentialApi, key);
        } catch {
          return { ok: false, error: "OpenCode could not store the credential. Try again." };
        }
        if (requestId) auth.settle(requestId, "saved");
        return { ok: true };
      },
      cancel: async (input) => {
        const { requestId } = input as { requestId: string };
        return auth.settle(requestId, "cancelled");
      },
    });
    auth.setEmit(async (reason, requestId) => {
      await rpcRegistration.events.emit("request", { requestId, reason });
    });

    const toolRegistration = await ctx.tool.transform((editor) => {
      editor.add({
        name: "fast_context_search",
        description: TOOL_DESCRIPTION,
        input: TOOL_INPUT_SCHEMA,
        options: { codemode: false },
        execute: async (rawInput, toolContext) => {
          const input = rawInput as { query: string; maxFiles?: number };
          const result = await runFastContext({
            root,
            query: input.query,
            config,
            credentials: auth.broker,
            ...(input.maxFiles ? { maxFiles: input.maxFiles } : {}),
            ...(toolContext.signal ? { signal: toolContext.signal } : {}),
          });
          return {
            content: formatForModel(result),
            metadata: { fast_context: result },
          };
        },
      });
    });

    const guidanceRegistration =
      config.autoInvoke === "off"
        ? null
        : await ctx.session.hook("context", (input) => {
            applyAutoInvokeGuidance(input.system, "suggest");
          });

    return async () => {
      await guidanceRegistration?.dispose();
      await toolRegistration.dispose();
      await rpcRegistration.dispose();
      await integrationRegistration.dispose();
    };
  },
});
