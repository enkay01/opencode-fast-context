import { Plugin } from "@opencode/plugin";
import { createAuthBroker } from "./auth-broker.ts";
import { FastContextAuthRpc } from "./auth-rpc.ts";
import { readPublicConfig } from "./config.ts";
import {
  FAST_CONTEXT_INTEGRATION_ID,
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
} from "./tool.ts";

/** OpenCode 2 plugin entry point. */
export default Plugin.define({
  id: "fast-context",
  async setup(ctx: Plugin.Context) {
    const config = readPublicConfig(ctx.options as Record<string, unknown> | undefined);
    const root = ctx.location.project?.directory || ctx.location.directory;
    const integration = ctx.integration as unknown as IntegrationCredentialApi;

    const auth = createAuthBroker({
      resolveStored: async () => {
        try {
          return await resolveStoredApiKey(integration);
        } catch {
          return undefined;
        }
      },
      activeCredentialID: async () => {
        try {
          const connection = await integration.connection.active(FAST_CONTEXT_INTEGRATION_ID);
          if (connection?.type !== "credential" || typeof connection.id !== "string") return undefined;
          return connection.id;
        } catch {
          return undefined;
        }
      },
    });

    const integrationRegistration = await registerFastContextIntegration(integration);

    const rpcRegistration = await ctx.rpc.register(FastContextAuthRpc, {
      attach: async (input) => {
        const { sessions } = input as { sessions: string[] };
        return auth.attach(sessions);
      },
      detach: async () => {
        auth.detach();
        return {};
      },
      acknowledge: async (input) => {
        const { credentialIDs } = input as { credentialIDs: string[] };
        auth.acknowledge(credentialIDs);
        return { ok: true };
      },
      status: async () => ({
        env: Boolean(process.env.TYPESAFE_API_KEY),
        stored: await hasStoredCredential(integration),
      }),
      submitKey: async (input) => {
        const { requestId, key } = input as { requestId?: string; key: string };
        const verification = await verifyApiKey(key);
        if (verification !== "valid") {
          return { ok: false, error: verificationErrorMessage(verification) };
        }
        try {
          await storeApiKey(integration, key);
        } catch {
          return { ok: false, error: "OpenCode could not store the credential. Try again." };
        }
        auth.clearRejected();
        if (requestId) auth.settle(requestId, "saved");
        return { ok: true };
      },
      cancel: async (input) => {
        const { requestId } = input as { requestId: string };
        return auth.settle(requestId, "cancelled");
      },
    });
    auth.setEmit(async (event) => {
      await rpcRegistration.events.emit("request", event as unknown as Readonly<Record<string, unknown>>);
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
            sessionID: toolContext.sessionID,
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
      auth.dispose();
      await guidanceRegistration?.dispose();
      await toolRegistration.dispose();
      await rpcRegistration.dispose();
      await integrationRegistration.dispose();
    };
  },
});
