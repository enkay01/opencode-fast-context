import { jsx as _jsx, jsxs as _jsxs } from "@opentui/solid/jsx-runtime";
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { createSignal } from "solid-js";
import { parseAuthCommand } from "./auth-command.js";
import { FastContextAuthRpc } from "./auth-rpc.js";
import { FAST_CONTEXT_INTEGRATION_ID, GEMINI_INTEGRATION_ID, removeAllFastContextCredentials, removeFastContextCredentials, removeStaleFastContextCredentials, } from "./credentials.js";
import { applyMaskDelta, createMaskState, SECRET_MASK } from "./mask.js";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PROMPT_FOOTER = `Enter to save · Esc to cancel · input shows ${SECRET_MASK} per character`;
function credentialLabel(status) {
    return status.env ? "environment key" : status.stored ? "stored key" : "no key";
}
function connectionLabel(status) {
    if (status.failure)
        return `error (${status.failure})`;
    if (status.connection === "missing")
        return "no key";
    return status.connection;
}
const statusTime = (time) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
/**
 * Masked single-line key entry. The renderable is updated imperatively so the
 * prompt does not depend on the plugin's own Solid instance reaching the
 * host renderer; only the host-owned dialog shell renders it.
 */
function MaskedKeyPrompt(props) {
    const context = usePlugin();
    const theme = context.theme.surface("dialog");
    const mask = createMaskState();
    let input;
    let errorText;
    let footerText;
    let busy = false;
    const showError = (message) => {
        if (errorText)
            errorText.content = message ?? "";
    };
    const showBusy = (value) => {
        busy = value;
        if (footerText)
            footerText.content = busy ? `Verifying with ${props.provider === "gemini" ? "Google" : "TypeSafe"}…` : PROMPT_FOOTER;
    };
    const handleInput = () => {
        if (busy || !input)
            return;
        const next = applyMaskDelta(mask, input.plainText, input.cursorOffset);
        mask.secret = next.secret;
        mask.shown = next.shown;
        if (input.plainText !== next.shown) {
            input.value = next.shown;
        }
        input.cursorOffset = next.cursor;
        showError(undefined);
    };
    const handleSubmit = async () => {
        if (busy)
            return;
        const key = mask.secret;
        if (!key) {
            showError(`Enter your ${props.provider === "gemini" ? "Gemini" : "TypeSafe"} API key.`);
            return;
        }
        showBusy(true);
        showError(undefined);
        try {
            const failure = await props.submit(key);
            if (failure === undefined) {
                props.onDone();
                return;
            }
            showError(failure);
        }
        finally {
            showBusy(false);
        }
    };
    context.keymap.layer(() => ({
        mode: "modal",
        commands: [
            {
                bind: "escape",
                title: "Cancel",
                group: "Fast Context",
                run: () => props.onCancel(),
            },
        ],
    }));
    return (_jsxs("box", { flexDirection: "column", gap: 1, padding: 1, children: [_jsx("text", { fg: theme.text.base, children: props.title }), _jsx("text", { fg: theme.text.muted, children: props.description }), _jsx("input", { ref: (el) => {
                    input = el;
                    if (el)
                        setTimeout(() => el.focus(), 1);
                }, placeholder: props.placeholder ?? (props.provider === "gemini" ? "Gemini API key" : "TypeSafe API key"), maxLength: 512, onInput: handleInput, onSubmit: () => void handleSubmit() }), _jsx("text", { ref: (el) => { errorText = el; }, fg: theme.text.feedback.error.base }), _jsx("text", { ref: (el) => { footerText = el; }, fg: theme.text.faint, children: PROMPT_FOOTER })] }));
}
export default Plugin.define({
    id: "fast-context",
    async setup(context) {
        const client = context.client.rpc(FastContextAuthRpc);
        const api = context.client;
        const [view, setView] = createSignal(null);
        let statusRequest = 0;
        const refreshStatus = async () => {
            const request = ++statusRequest;
            const status = await client.status({}).then((value) => value, () => null);
            if (request === statusRequest)
                setView(status);
            return status;
        };
        const unsubscribeState = client.events.on("state", () => { void refreshStatus(); });
        const removeSidebar = context.ui.slot({
            append: "sidebar.footer",
            render: () => {
                const status = view();
                if (!status)
                    return _jsx("text", { children: "Fast Context \u00B7 status unavailable" });
                if (!status.provider)
                    return _jsx("text", { children: "Fast Context \u00B7 choose provider" });
                const credential = credentialLabel(status);
                const verified = status.verifiedAt === undefined ? "" : ` · verified ${statusTime(status.verifiedAt)}`;
                return (_jsxs("box", { flexDirection: "column", children: [_jsx("text", { children: `Fast Context · ${status.provider}${status.failure ? "" : ` · ${connectionLabel(status)}`}` }), status.failure && _jsx("text", { children: connectionLabel(status) }), status.connection !== "missing" && _jsx("text", { children: `${credential}${verified}` })] }));
            },
        });
        void refreshStatus();
        const activeProvider = async () => {
            const status = (await client.status({}));
            return status.provider;
        };
        const credentialID = (provider) => provider === "gemini" ? GEMINI_INTEGRATION_ID : FAST_CONTEXT_INTEGRATION_ID;
        /** Root sessions this TUI is showing. Subagent sessions never prompt. */
        const interactiveSessions = () => {
            const sessions = new Set();
            const route = context.ui.router.current();
            if (route.type === "session" && !context.data.session.get(route.sessionID)?.parentID) {
                sessions.add(route.sessionID);
            }
            for (const tab of context.ui.tabs.list()) {
                if (!context.data.session.get(tab.sessionID)?.parentID)
                    sessions.add(tab.sessionID);
            }
            return [...sessions];
        };
        /** Re-registers visible sessions and removes credentials rejected elsewhere. */
        const syncAttachment = async () => {
            const response = (await client.attach({ sessions: interactiveSessions() }));
            if (response.remove.length === 0)
                return;
            try {
                await removeFastContextCredentials(api.credential, response.remove);
                // Acknowledge every requested ID: absent and foreign records are
                // already in the desired state, so they must not be retried forever.
                await client.acknowledge({ credentialIDs: response.remove });
            }
            catch {
                // Keep the IDs queued; the next attach retries the removal.
            }
        };
        // The server part registers the RPC during its own setup; retry briefly
        // so attach does not fail on startup ordering.
        for (let attempt = 0; attempt < 20; attempt += 1) {
            try {
                await syncAttachment();
                break;
            }
            catch {
                if (attempt === 19)
                    break;
                await sleep(250);
            }
        }
        const refreshAttachment = () => {
            void syncAttachment().catch(() => { });
            void refreshStatus();
        };
        // There is no RPC reconnect event. Refresh status to detect lost bridges
        // and selection changes made by a different server instance.
        const statusTimer = setInterval(() => { void refreshStatus(); }, 5000);
        void refreshStatus();
        const unsubscribeViewed = context.data.on("session.viewed", refreshAttachment);
        const unsubscribeCreated = context.data.on("session.created", refreshAttachment);
        /** Shows the masked prompt; resolves after save or cancel. */
        const collectKey = (options) => new Promise((resolve) => {
            let settled = false;
            const finish = (outcome) => {
                if (settled)
                    return;
                settled = true;
                context.ui.dialog.clear();
                resolve(outcome);
            };
            const cancel = () => {
                if (options.requestId)
                    void client.cancel({ requestId: options.requestId }).catch(() => { });
                finish("cancelled");
            };
            context.ui.dialog.show(() => (_jsx(MaskedKeyPrompt, { provider: options.provider, title: options.title, description: options.description, submit: async (key) => {
                    try {
                        const result = (await client.submitKey({
                            ...(options.requestId ? { requestId: options.requestId } : {}),
                            provider: options.provider,
                            key,
                        }));
                        if (!result.ok)
                            return result.error ?? "Could not save the key.";
                        if (settled && !options.requestId) {
                            context.ui.toast.show({ title: "Fast Context", message: "Key saved. Run /fast-context provider to finish setup.", variant: "warning" });
                        }
                        try {
                            await removeStaleFastContextCredentials(api.credential, credentialID(options.provider));
                        }
                        catch {
                            // The new key is active; stale rows are retried on the next save.
                        }
                        return undefined;
                    }
                    catch {
                        return "Could not reach the OpenCode server. Try again.";
                    }
                }, onDone: () => finish("saved"), onCancel: cancel })), () => {
                if (settled)
                    return;
                if (options.requestId)
                    void client.cancel({ requestId: options.requestId }).catch(() => { });
                finish("cancelled");
            });
        });
        // Server-initiated prompts are serialized so concurrent searches do not
        // fight over the single modal dialog.
        const queue = [];
        let draining = false;
        const enqueue = (task) => {
            queue.push(task);
            if (draining)
                return;
            draining = true;
            void (async () => {
                while (queue.length > 0)
                    await queue.shift()();
                draining = false;
            })();
        };
        const handleRequest = (event) => {
            enqueue(async () => {
                if (event.reason === "expired") {
                    try {
                        // Remove the rejected record before offering a replacement so a
                        // cancelled prompt cannot leave the dead key resolvable.
                        await removeAllFastContextCredentials(api.credential, credentialID(event.provider));
                    }
                    catch {
                        // The prompt still offers a replacement key.
                    }
                }
                const service = event.provider === "gemini" ? "Google" : "TypeSafe";
                const title = event.reason === "expired" ? `Fast Context ${service} credential expired` : `Connect Fast Context to ${service}`;
                const description = event.provider === "gemini"
                    ? "Google receives bounded query and source excerpts. Free-tier data may be reviewed and used to improve products; see aistudio.google.com/docs/terms. The key is verified and stored in OpenCode."
                    : event.reason === "expired"
                        ? "The stored key was rejected by TypeSafe. Enter a replacement key; it is verified live and saved in OpenCode's credential store."
                        : "Fast Context needs a TypeSafe API key for Jev ranking. Enter it once; it is verified live and saved in OpenCode's credential store, not in this project.";
                await collectKey({ title, description, provider: event.provider, requestId: event.requestId });
            });
        };
        const unsubscribeRequest = client.events.on("request", (event) => {
            handleRequest(event.data);
        });
        const showStatus = async () => {
            const status = await refreshStatus();
            const message = status ? [
                `Selected: ${status.provider ?? "none"}`,
                `Connection: ${connectionLabel(status)}${status.checkedAt === undefined ? "" : ` · ${status.failure ? "checked" : "verified"} ${statusTime(status.checkedAt)}`}`,
                `Server instance: ${status.instanceID}`,
                `jev: ${credentialLabel(status.jev)} · gemini: ${credentialLabel(status.gemini)}`,
                "Use /fast-context provider to switch or /fast-context auth to set up a key.",
            ].join("\n") : "Status unavailable. Check the OpenCode server and retry.";
            await context.ui.dialog.alert({ title: "Fast Context providers", message });
        };
        const chooseProvider = async () => {
            const choice = await context.ui.dialog.select({
                title: "Select Fast Context provider",
                options: [
                    { title: "Gemini Decisions", value: "gemini", description: "Google Gemini API key; Google receives bounded source excerpts" },
                    { title: "Jev", value: "jev", description: "TypeSafe API key" },
                ],
            });
            return choice;
        };
        const activate = async (provider, keySaved = false) => {
            const report = (error) => context.ui.toast.show({
                title: "Fast Context",
                message: keySaved ? `Key saved. ${error}` : error,
                variant: "error",
            });
            try {
                const result = (await client.selectProvider({ provider }));
                if (!result.ok) {
                    report(result.error ?? "Could not select provider.");
                    return;
                }
                const status = await refreshStatus();
                if (!status) {
                    report("Could not read server status. Run /fast-context auth status and retry.");
                    return;
                }
                if (status.instanceID !== result.instanceID) {
                    report("Selection and status reached different Fast Context instances. Check for duplicate plugin entries.");
                    return;
                }
                if (status.provider !== provider || status.connection !== "connected") {
                    report("Server status did not confirm the provider is connected and selected. Check /fast-context auth status and retry.");
                    return;
                }
                context.ui.toast.show({ title: "Fast Context", message: `${provider} connected and selected.`, variant: "success" });
            }
            catch {
                setView(null);
                report("Could not confirm the provider selection. Check /fast-context auth status and retry.");
            }
        };
        const selectProvider = async (requested) => {
            const provider = requested ?? await chooseProvider();
            if (!provider)
                return;
            const status = (await client.status({}));
            if (!status[provider].env && !status[provider].stored) {
                await promptAndSave(provider);
            }
            else {
                await activate(provider);
            }
        };
        const promptAndSave = async (requested) => {
            const status = (await client.status({}));
            const provider = requested ?? status.provider ?? await chooseProvider();
            if (!provider)
                return;
            if (status[provider].env) {
                await activate(provider);
                return;
            }
            const outcome = await collectKey({
                provider,
                title: "Store a Fast Context credential",
                description: provider === "gemini"
                    ? "Enter your Gemini API key. Google receives bounded source excerpts. Free-tier data may be reviewed and used to improve products; see aistudio.google.com/docs/terms. The key is stored in OpenCode."
                    : "Enter your TypeSafe API key. It is verified live, then saved in OpenCode's credential store. The key is never written to this project or your shell profile.",
            });
            if (outcome === "saved") {
                await activate(provider, true);
            }
        };
        const revoke = async (requested) => {
            const provider = requested ?? await activeProvider() ?? await chooseProvider();
            if (!provider)
                return;
            const confirmed = await context.ui.dialog.confirm({
                title: "Revoke Fast Context credential?",
                message: `This removes stored ${provider} keys only. The environment key and other provider's keys are not affected.`,
                label: { confirm: "Revoke", cancel: "Keep" },
            });
            if (!confirmed)
                return;
            try {
                await removeAllFastContextCredentials(api.credential, credentialID(provider));
                await client.credentialRevoked({ provider });
                await refreshStatus();
                context.ui.toast.show({ title: "Fast Context", message: "Stored credential revoked.", variant: "success" });
            }
            catch {
                context.ui.toast.show({ title: "Fast Context", message: "Could not revoke the credential.", variant: "error" });
            }
        };
        const runAuthCommand = async (input) => {
            const command = parseAuthCommand(input ?? "");
            switch (command.action) {
                case "select":
                    await selectProvider(command.provider);
                    return;
                case "set":
                    await promptAndSave(command.provider);
                    return;
                case "status":
                    await showStatus();
                    return;
                case "revoke":
                    await revoke(command.provider);
                    return;
                case "help":
                    await context.ui.dialog.alert({
                        title: "Fast Context auth",
                        message: "/fast-context provider - select Jev or Gemini\n/fast-context auth - set up the selected provider\n/fast-context auth gemini - set up Gemini directly\n/fast-context auth status - show both providers\n/fast-context auth revoke - remove the selected provider's stored keys",
                    });
                    return;
                case "unknown":
                    context.ui.toast.show({
                        title: "Fast Context",
                        message: `Unknown auth command "${command.token}". Try /fast-context auth help.`,
                        variant: "warning",
                    });
            }
        };
        context.keymap.layer(() => ({
            mode: "global",
            commands: [
                {
                    id: "fast-context.auth",
                    title: "Fast Context auth",
                    description: "Choose Jev or Gemini, then manage each credential",
                    group: "Fast Context",
                    palette: true,
                    slash: { name: "fast-context", arguments: true },
                    run: async (input) => {
                        refreshAttachment();
                        try {
                            await runAuthCommand(input ?? "");
                        }
                        catch {
                            setView(null);
                            context.ui.toast.show({ title: "Fast Context", message: "Provider status is unavailable. Check the OpenCode server and retry.", variant: "error" });
                        }
                    },
                },
            ],
        }));
        return () => {
            clearInterval(statusTimer);
            statusRequest++;
            unsubscribeState();
            removeSidebar();
            unsubscribeRequest();
            unsubscribeViewed();
            unsubscribeCreated();
            void client.detach({}).catch(() => { });
        };
    },
});
