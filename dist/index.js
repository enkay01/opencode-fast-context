import { Plugin } from "@opencode/plugin";
import { randomUUID } from "node:crypto";
import { createAuthBroker } from "./auth-broker.js";
import { FastContextAuthRpc } from "./auth-rpc.js";
import { readPublicConfig } from "./config.js";
import { FAST_CONTEXT_INTEGRATION_ID, GEMINI_INTEGRATION_ID, hasStoredCredential, registerFastContextIntegration, resolveStoredApiKey, storeApiKey, verifyApiKey, verifyGeminiApiKey, verificationErrorMessage, } from "./credentials.js";
import { applyAutoInvokeGuidance } from "./guidance.js";
import { TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA, formatForModel, runFastContext, } from "./tool.js";
const SELECTION_STORAGE_ERROR = "Provider selection storage is unavailable. Check /fast-context auth status and retry.";
const SELECTION_KEY = "selectedProvider";
/** OpenCode 2 plugin entry point. */
export default Plugin.define({
    id: "fast-context",
    async setup(ctx) {
        const config = readPublicConfig(ctx.options);
        const instanceID = randomUUID();
        const observations = {};
        const record = (provider, source, failure) => {
            const checkedAt = Date.now();
            const previous = observations[provider];
            const verifiedAt = failure ? (previous?.source === source ? previous.verifiedAt : undefined) : checkedAt;
            observations[provider] = { source, checkedAt, ...(verifiedAt === undefined ? {} : { verifiedAt }), ...(failure ? { failure } : {}) };
        };
        const storedSelection = async () => {
            if (config.providerError)
                throw new Error(config.providerError);
            try {
                const stored = await ctx.storage.get(SELECTION_KEY);
                if (stored === undefined || stored === "jev" || stored === "gemini")
                    return stored;
            }
            catch {
                throw new Error(SELECTION_STORAGE_ERROR);
            }
            throw new Error("Stored provider selection is invalid. Check OpenCode plugin storage.");
        };
        const selection = async () => (await storedSelection()) ?? config.decisionProvider ?? null;
        const persistSelection = async (provider) => {
            const previous = await storedSelection();
            let wrote = false;
            try {
                await ctx.storage.set(SELECTION_KEY, provider);
                wrote = true;
                if (await storedSelection() === provider)
                    return;
            }
            catch {
                // A write may have been applied even if its acknowledgement failed.
                const current = await storedSelection().catch(() => wrote ? provider : undefined);
                if (current === provider && previous !== provider) {
                    try {
                        if (previous === undefined)
                            await ctx.storage.remove(SELECTION_KEY);
                        else
                            await ctx.storage.set(SELECTION_KEY, previous);
                    }
                    catch {
                        throw new Error("Could not restore the previous provider. Check /fast-context auth status before searching.");
                    }
                }
            }
            throw new Error("Provider selection did not persist. Check OpenCode plugin storage and retry.");
        };
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
                const provider = await selection();
                const jev = { env: Boolean(process.env.TYPESAFE_API_KEY), stored: await hasStoredCredential(integration, FAST_CONTEXT_INTEGRATION_ID) };
                const gemini = { env: Boolean(process.env.GEMINI_API_KEY), stored: await hasStoredCredential(integration, GEMINI_INTEGRATION_ID) };
                const { env, stored } = provider ? { jev, gemini }[provider] : { env: false, stored: false };
                const source = env ? "env" : stored ? "store" : null;
                const recent = provider ? observations[provider] : undefined;
                const rejected = !source && (recent?.failure === "401" || recent?.failure === "403");
                const current = recent?.source === source || rejected ? recent : undefined;
                const connection = current?.failure ? "error" : !provider ? "unselected" : !source ? "missing" : current ? "connected" : "unverified";
                return {
                    provider, env, stored, source, jev, gemini, instanceID, connection,
                    ...(current ? { checkedAt: current.checkedAt } : {}),
                    ...(current?.verifiedAt === undefined ? {} : { verifiedAt: current.verifiedAt }),
                    ...(current?.failure ? { failure: current.failure } : {}),
                };
            },
            selectProvider: async (input) => {
                const { provider } = input;
                const key = provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.TYPESAFE_API_KEY;
                let candidate;
                try {
                    await storedSelection();
                    candidate = key || await resolveStoredApiKey(integration, integrationID(provider));
                }
                catch {
                    return { provider, ok: false, error: "Could not read OpenCode provider or credential storage." };
                }
                if (!candidate)
                    return { provider, ok: false, error: `No ${provider} key is configured.` };
                const verified = provider === "gemini" ? await verifyGeminiApiKey(candidate) : await verifyApiKey(candidate);
                if (verified !== "valid")
                    return { provider, ok: false, error: verified === "invalid" ? `${provider} rejected the key.` : `Could not verify ${provider} access.` };
                try {
                    await persistSelection(provider);
                }
                catch (error) {
                    return { provider, ok: false, error: error.message };
                }
                record(provider, key ? "env" : "store");
                await rpcRegistration.events.emit("state", {}).catch(() => { });
                return { provider, ok: true, instanceID };
            },
            submitKey: async (input) => {
                const { requestId, key, provider: requested } = input;
                const provider = requested ?? await selection();
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
                const envKey = provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.TYPESAFE_API_KEY;
                if (!envKey)
                    record(provider, "store");
                await rpcRegistration.events.emit("state", {}).catch(() => { });
                if (requestId)
                    auth[provider].settle(requestId, "saved");
                return { ok: true };
            },
            credentialRevoked: async (input) => {
                const { provider } = input;
                if (observations[provider]?.source === "store")
                    delete observations[provider];
                await rpcRegistration.events.emit("state", {}).catch(() => { });
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
                    let choice;
                    let selectionError;
                    try {
                        choice = await selection();
                    }
                    catch (error) {
                        choice = null;
                        selectionError = error.message;
                    }
                    let providerChecked = false;
                    const result = choice ? await runFastContext({
                        root,
                        query: input.query,
                        config: { ...config, decisionProvider: choice },
                        credentials: auth[choice].broker,
                        onProviderOutcome: (source, failure) => {
                            if (!choice)
                                return;
                            providerChecked = true;
                            record(choice, source, failure);
                        },
                        sessionID: toolContext.sessionID,
                        ...(input.maxFiles ? { maxFiles: input.maxFiles } : {}),
                        ...(toolContext.signal ? { signal: toolContext.signal } : {}),
                    }) : await runFastContext({ root, query: input.query,
                        config: { ...config, providerError: selectionError
                                ?? "Select Jev or Gemini with /fast-context provider before searching." } });
                    if (providerChecked)
                        await rpcRegistration.events.emit("state", {}).catch(() => { });
                    return {
                        content: formatForModel(result),
                        metadata: { fast_context: result, fast_context_instance: instanceID },
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
