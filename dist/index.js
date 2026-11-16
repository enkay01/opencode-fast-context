import { Plugin } from "@opencode/plugin";
import { createAuthBroker } from "./auth-broker.js";
import { FastContextAuthRpc } from "./auth-rpc.js";
import { readPublicConfig } from "./config.js";
import { FAST_CONTEXT_INTEGRATION_ID, GEMINI_INTEGRATION_ID, hasStoredCredential, registerFastContextIntegration, resolveStoredApiKey, storeApiKey, verifyApiKey, verifyGeminiApiKey, verificationErrorMessage, } from "./credentials.js";
import { applyAutoInvokeGuidance } from "./guidance.js";
import { TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA, formatForModel, runFastContext, } from "./tool.js";
/** OpenCode 2 plugin entry point. */
export default Plugin.define({
    id: "fast-context",
    async setup(ctx) {
        const config = readPublicConfig(ctx.options);
        const storedSelection = await ctx.storage.get("selectedProvider");
        let selected = storedSelection === "jev" || storedSelection === "gemini"
            ? storedSelection : config.decisionProvider ?? null;
        const root = ctx.location.project?.directory || ctx.location.directory;
        const integration = ctx.integration;
        const integrationID = (provider) => provider === "gemini" ? GEMINI_INTEGRATION_ID : FAST_CONTEXT_INTEGRATION_ID;
        const makeBroker = (provider) => createAuthBroker({
            resolveStored: async () => {
                try {
                    return await resolveStoredApiKey(integration, integrationID(provider));
                }
                catch {
                    return undefined;
                }
            },
            activeCredentialID: async () => {
                try {
                    const connection = await integration.connection.active(integrationID(provider));
                    if (connection?.type !== "credential" || typeof connection.id !== "string")
                        return undefined;
                    return connection.id;
                }
                catch {
                    return undefined;
                }
            },
        });
        const auth = { jev: makeBroker("jev"), gemini: makeBroker("gemini") };
        const integrationRegistration = await registerFastContextIntegration(integration);
        const geminiRegistration = await registerFastContextIntegration(integration, "gemini");
        const rpcRegistration = await ctx.rpc.register(FastContextAuthRpc, {
            attach: async (input) => {
                const { sessions } = input;
                return { remove: [...auth.jev.attach(sessions).remove, ...auth.gemini.attach(sessions).remove] };
            },
            detach: async () => {
                auth.jev.detach();
                auth.gemini.detach();
                return {};
            },
            acknowledge: async (input) => {
                const { credentialIDs } = input;
                auth.jev.acknowledge(credentialIDs);
                auth.gemini.acknowledge(credentialIDs);
                return { ok: true };
            },
            status: async () => {
                const jev = { env: Boolean(process.env.TYPESAFE_API_KEY), stored: await hasStoredCredential(integration, FAST_CONTEXT_INTEGRATION_ID) };
                const gemini = { env: Boolean(process.env.GEMINI_API_KEY), stored: await hasStoredCredential(integration, GEMINI_INTEGRATION_ID) };
                return { provider: selected, env: selected ? (selected === "jev" ? jev : gemini).env : false,
                    stored: selected ? (selected === "jev" ? jev : gemini).stored : false, jev, gemini };
            },
            selectProvider: async (input) => {
                const { provider } = input;
                await ctx.storage.set("selectedProvider", provider);
                selected = provider;
                return { provider };
            },
            submitKey: async (input) => {
                const { requestId, key, provider: requested } = input;
                const provider = requested ?? selected;
                if (!provider)
                    return { ok: false, error: "Select a provider before storing a key." };
                const verification = provider === "gemini" ? await verifyGeminiApiKey(key) : await verifyApiKey(key);
                if (verification !== "valid") {
                    return { ok: false, error: provider === "gemini"
                            ? verification === "invalid" ? "Google rejected this Gemini API key (HTTP 401/403)." : "Could not verify this Gemini API key with Google. Try again."
                            : verificationErrorMessage(verification) };
                }
                try {
                    await storeApiKey(integration, key, integrationID(provider));
                }
                catch {
                    return { ok: false, error: "OpenCode could not store the credential. Try again." };
                }
                auth[provider].clearRejected();
                if (requestId)
                    auth[provider].settle(requestId, "saved");
                return { ok: true };
            },
            cancel: async (input) => {
                const { requestId } = input;
                auth.jev.settle(requestId, "cancelled");
                return auth.gemini.settle(requestId, "cancelled");
            },
        });
        for (const provider of ["jev", "gemini"]) {
            auth[provider].setEmit(async (event) => {
                await rpcRegistration.events.emit("request", { ...event, provider });
            });
        }
        const toolRegistration = await ctx.tool.transform((editor) => {
            editor.add({
                name: "fast_context_search",
                description: TOOL_DESCRIPTION,
                input: TOOL_INPUT_SCHEMA,
                options: { codemode: false },
                execute: async (rawInput, toolContext) => {
                    const input = rawInput;
                    const choice = selected;
                    const result = choice ? await runFastContext({
                        root,
                        query: input.query,
                        config: { ...config, decisionProvider: choice },
                        credentials: auth[choice].broker,
                        sessionID: toolContext.sessionID,
                        ...(input.maxFiles ? { maxFiles: input.maxFiles } : {}),
                        ...(toolContext.signal ? { signal: toolContext.signal } : {}),
                    }) : await runFastContext({ root, query: input.query,
                        config: { ...config, providerError: "Select Jev or Gemini with /fast-context provider before searching." } });
                    return {
                        content: formatForModel(result),
                        metadata: { fast_context: result },
                    };
                },
            });
        });
        const guidanceRegistration = config.autoInvoke === "off"
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
