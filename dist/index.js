import { Plugin } from "@opencode/plugin";
import { createAuthBroker } from "./auth-broker.js";
import { FastContextAuthRpc } from "./auth-rpc.js";
import { readPublicConfig } from "./config.js";
import { FAST_CONTEXT_INTEGRATION_ID, hasStoredCredential, registerFastContextIntegration, resolveStoredApiKey, storeApiKey, verifyApiKey, verificationErrorMessage, } from "./credentials.js";
import { applyAutoInvokeGuidance } from "./guidance.js";
import { TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA, formatForModel, runFastContext, } from "./tool.js";
/** OpenCode 2 plugin entry point. */
export default Plugin.define({
    id: "fast-context",
    async setup(ctx) {
        const config = readPublicConfig(ctx.options);
        const root = ctx.location.project?.directory || ctx.location.directory;
        const integration = ctx.integration;
        const auth = createAuthBroker({
            resolveStored: async () => {
                try {
                    return await resolveStoredApiKey(integration);
                }
                catch {
                    return undefined;
                }
            },
            activeCredentialID: async () => {
                try {
                    const connection = await integration.connection.active(FAST_CONTEXT_INTEGRATION_ID);
                    if (connection?.type !== "credential" || typeof connection.id !== "string")
                        return undefined;
                    return connection.id;
                }
                catch {
                    return undefined;
                }
            },
        });
        const integrationRegistration = await registerFastContextIntegration(integration);
        const rpcRegistration = await ctx.rpc.register(FastContextAuthRpc, {
            attach: async (input) => {
                const { sessions } = input;
                return auth.attach(sessions);
            },
            detach: async () => {
                auth.detach();
                return {};
            },
            acknowledge: async (input) => {
                const { credentialIDs } = input;
                auth.acknowledge(credentialIDs);
                return { ok: true };
            },
            status: async () => ({
                env: Boolean(process.env.TYPESAFE_API_KEY),
                stored: await hasStoredCredential(integration),
            }),
            submitKey: async (input) => {
                const { requestId, key } = input;
                const verification = await verifyApiKey(key);
                if (verification !== "valid") {
                    return { ok: false, error: verificationErrorMessage(verification) };
                }
                try {
                    await storeApiKey(integration, key);
                }
                catch {
                    return { ok: false, error: "OpenCode could not store the credential. Try again." };
                }
                auth.clearRejected();
                if (requestId)
                    auth.settle(requestId, "saved");
                return { ok: true };
            },
            cancel: async (input) => {
                const { requestId } = input;
                return auth.settle(requestId, "cancelled");
            },
        });
        auth.setEmit(async (event) => {
            await rpcRegistration.events.emit("request", event);
        });
        const toolRegistration = await ctx.tool.transform((editor) => {
            editor.add({
                name: "fast_context_search",
                description: TOOL_DESCRIPTION,
                input: TOOL_INPUT_SCHEMA,
                options: { codemode: false },
                execute: async (rawInput, toolContext) => {
                    const input = rawInput;
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
        const guidanceRegistration = config.autoInvoke === "off"
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
