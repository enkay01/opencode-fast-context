import { Plugin } from "@opencode/plugin";
import { randomUUID } from "node:crypto";
import { createAuthBroker } from "./auth-broker.ts";
import { FastContextAuthRpc } from "./auth-rpc.ts";
import { readPublicConfig, type ProviderKind } from "./config.ts";
import {
  FAST_CONTEXT_INTEGRATION_ID,
  GEMINI_INTEGRATION_ID,
  hasStoredCredential,
  registerFastContextIntegration,
  resolveStoredApiKey,
  storeApiKey,
  verifyApiKey,
  verifyGeminiApiKey,
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
    const instanceID = randomUUID();
    const observations: Record<ProviderKind, { connection: "connected" | "error"; checkedAt: number; failure?: string } | undefined> = { jev: undefined, gemini: undefined };
    const selection = async (): Promise<ProviderKind | null> => {
      const stored = await ctx.storage.get("selectedProvider");
      return stored === "jev" || stored === "gemini" ? stored : config.decisionProvider ?? null;
    };
    const root = ctx.location.project?.directory || ctx.location.directory;
    const integration = ctx.integration as unknown as IntegrationCredentialApi;
    const integrationID = (provider: ProviderKind) => provider === "gemini" ? GEMINI_INTEGRATION_ID : FAST_CONTEXT_INTEGRATION_ID;

    const makeBroker = (provider: ProviderKind) => createAuthBroker({
      resolveStored: async () => {
        try {
          return await resolveStoredApiKey(integration, integrationID(provider));
        } catch {
          return undefined;
        }
      },
      activeCredentialID: async () => {
        try {
          const connection = await integration.connection.active(integrationID(provider));
          if (connection?.type !== "credential" || typeof connection.id !== "string") return undefined;
          return connection.id;
        } catch {
          return undefined;
        }
      },
    });
    const auth = { jev: makeBroker("jev"), gemini: makeBroker("gemini") };

    const integrationRegistration = await registerFastContextIntegration(integration);
    const geminiRegistration = await registerFastContextIntegration(integration, "gemini");

    const rpcRegistration = await ctx.rpc.register(FastContextAuthRpc, {
      attach: async (input) => {
        const { sessions } = input as { sessions: string[] };
        return { remove: [...auth.jev.attach(sessions).remove, ...auth.gemini.attach(sessions).remove] };
      },
      detach: async () => {
        auth.jev.detach();
        auth.gemini.detach();
        return {};
      },
      acknowledge: async (input) => {
        const { credentialIDs } = input as { credentialIDs: string[] };
        auth.jev.acknowledge(credentialIDs);
        auth.gemini.acknowledge(credentialIDs);
        return { ok: true };
      },
      status: async () => {
        const selected = await selection();
        const jev = { env: Boolean(process.env.TYPESAFE_API_KEY), stored: await hasStoredCredential(integration, FAST_CONTEXT_INTEGRATION_ID) };
        const gemini = { env: Boolean(process.env.GEMINI_API_KEY), stored: await hasStoredCredential(integration, GEMINI_INTEGRATION_ID) };
        const available = selected && (selected === "jev" ? jev : gemini);
        const observation = selected && available && (available.env || available.stored) ? observations[selected] : undefined;
        return { provider: selected, env: selected ? (selected === "jev" ? jev : gemini).env : false,
          stored: selected ? (selected === "jev" ? jev : gemini).stored : false, jev, gemini, instanceID,
          connection: !selected ? "unselected" : !available || (!available.env && !available.stored) ? "missing" : observation?.connection ?? "unverified",
          ...(observation ? { checkedAt: observation.checkedAt, ...(observation.failure ? { failure: observation.failure } : {}) } : {}) };
      },
      selectProvider: async (input) => {
        const { provider } = input as { provider: ProviderKind };
        const key = provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.TYPESAFE_API_KEY;
        const candidate = key || await resolveStoredApiKey(integration, integrationID(provider));
        if (!candidate) return { provider, ok: false, error: `No ${provider} key is configured.` };
        const verified = provider === "gemini" ? await verifyGeminiApiKey(candidate) : await verifyApiKey(candidate);
        if (verified !== "valid") return { provider, ok: false, error: verified === "invalid" ? `${provider} rejected the key.` : `Could not verify ${provider} access.` };
        await ctx.storage.set("selectedProvider", provider);
        if (await selection() !== provider) return { provider, ok: false, error: "Provider selection did not persist." };
        observations[provider] = { connection: "connected", checkedAt: Date.now() };
        await rpcRegistration.events.emit("state", {}).catch(() => {});
        return { provider, ok: true };
      },
      submitKey: async (input) => {
        const { requestId, key, provider: requested } = input as { requestId?: string; key: string; provider?: ProviderKind };
        const provider = requested ?? await selection();
        if (!provider) return { ok: false, error: "Select a provider before storing a key." };
        const verification = provider === "gemini" ? await verifyGeminiApiKey(key) : await verifyApiKey(key);
        if (verification !== "valid") {
          return { ok: false, error: provider === "gemini"
            ? verification === "invalid" ? "Google rejected this Gemini API key (HTTP 401/403)." : "Could not verify this Gemini API key with Google. Try again."
            : verificationErrorMessage(verification) };
        }
        try {
          await storeApiKey(integration, key, integrationID(provider));
        } catch {
          return { ok: false, error: "OpenCode could not store the credential. Try again." };
        }
        auth[provider].clearRejected();
        observations[provider] = { connection: "connected", checkedAt: Date.now() };
        await rpcRegistration.events.emit("state", {}).catch(() => {});
        if (requestId) auth[provider].settle(requestId, "saved");
        return { ok: true };
      },
      cancel: async (input) => {
        const { requestId } = input as { requestId: string };
        auth.jev.settle(requestId, "cancelled");
        return auth.gemini.settle(requestId, "cancelled");
      },
    });
    for (const provider of ["jev", "gemini"] as const) {
      auth[provider].setEmit(async (event) => {
        await rpcRegistration.events.emit("request", { ...event, provider } as unknown as Readonly<Record<string, unknown>>);
      });
    }

    const toolRegistration = await ctx.tool.transform((editor) => {
      editor.add({
        name: "fast_context_search",
        description: TOOL_DESCRIPTION,
        input: TOOL_INPUT_SCHEMA,
        options: { codemode: false },
        execute: async (rawInput, toolContext) => {
          const input = rawInput as { query: string; maxFiles?: number };
          let choice: ProviderKind | null;
          let selectionError = false;
          try { choice = await selection(); }
          catch { choice = null; selectionError = true; }
          const result = choice ? await runFastContext({
            root,
            query: input.query,
            config: { ...config, decisionProvider: choice },
            credentials: auth[choice].broker,
            sessionID: toolContext.sessionID,
            ...(input.maxFiles ? { maxFiles: input.maxFiles } : {}),
            ...(toolContext.signal ? { signal: toolContext.signal } : {}),
          }) : await runFastContext({ root, query: input.query,
            config: { ...config, providerError: selectionError
              ? "Provider selection storage is unavailable. Check /fast-context auth status and retry."
              : "Select Jev or Gemini with /fast-context provider before searching." } });
          if (choice) {
            const failure = result.status === "fallback_required" ? /401|403/.test(result.reason ?? "") ? "credential rejected" : /429/.test(result.reason ?? "") ? "quota" : "provider unavailable" : undefined;
            observations[choice] = failure ? { connection: "error", checkedAt: Date.now(), failure } : { connection: "connected", checkedAt: Date.now() };
            await rpcRegistration.events.emit("state", {}).catch(() => {});
          }
          return {
            content: formatForModel(result),
            metadata: { fast_context: result, fast_context_instance: instanceID },
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
      auth.jev.dispose();
      auth.gemini.dispose();
      await guidanceRegistration?.dispose();
      await toolRegistration.dispose();
      await rpcRegistration.dispose();
      await integrationRegistration.dispose();
      await geminiRegistration.dispose();
    };
  },
});
