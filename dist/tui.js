import { jsx as _jsx, jsxs as _jsxs } from "@opentui/solid/jsx-runtime";
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { parseAuthCommand } from "./auth-command.js";
import { FastContextAuthRpc } from "./auth-rpc.js";
import { FAST_CONTEXT_INTEGRATION_ID, removeAllFastContextCredentials, removeFastContextCredentials, removeStaleFastContextCredentials, } from "./credentials.js";
import { applyMaskDelta, createMaskState, SECRET_MASK } from "./mask.js";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PROMPT_FOOTER = `Enter to save · Esc to cancel · input shows ${SECRET_MASK} per character`;
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
            footerText.content = busy ? "Verifying with TypeSafe…" : PROMPT_FOOTER;
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
            showError("Enter your TypeSafe API key.");
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
                }, placeholder: props.placeholder ?? "TypeSafe API key", maxLength: 512, onInput: handleInput, onSubmit: () => void handleSubmit() }), _jsx("text", { ref: (el) => { errorText = el; }, fg: theme.text.feedback.error.base }), _jsx("text", { ref: (el) => { footerText = el; }, fg: theme.text.faint, children: PROMPT_FOOTER })] }));
}
export default Plugin.define({
    id: "fast-context",
    async setup(context) {
        const client = context.client.rpc(FastContextAuthRpc);
        const api = context.client;
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
        };
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
            context.ui.dialog.show(() => (_jsx(MaskedKeyPrompt, { title: options.title, description: options.description, submit: async (key) => {
                    try {
                        const result = (await client.submitKey({
                            ...(options.requestId ? { requestId: options.requestId } : {}),
                            key,
                        }));
                        if (!result.ok)
                            return result.error ?? "Could not save the key.";
                        try {
                            await removeStaleFastContextCredentials(api.credential);
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
                        await removeAllFastContextCredentials(api.credential);
                    }
                    catch {
                        // The prompt still offers a replacement key.
                    }
                }
                const title = event.reason === "expired"
                    ? "Fast Context credential expired"
                    : "Connect Fast Context to TypeSafe";
                const description = event.reason === "expired"
                    ? "The stored key was rejected by TypeSafe. Enter a replacement key; it is verified live and saved in OpenCode's credential store."
                    : "Fast Context needs a TypeSafe API key for Jev ranking. Enter it once; it is verified live and saved in OpenCode's credential store, not in this project.";
                await collectKey({ title, description, requestId: event.requestId });
            });
        };
        const unsubscribeRequest = client.events.on("request", (event) => {
            handleRequest(event.data);
        });
        const showStatus = async () => {
            try {
                const status = (await client.status({}));
                const sources = [];
                if (status.env)
                    sources.push("process.env.TYPESAFE_API_KEY (active; takes precedence)");
                if (status.stored)
                    sources.push(`OpenCode credential store (${FAST_CONTEXT_INTEGRATION_ID})`);
                const lines = sources.map((source) => `- ${source}`);
                await context.ui.dialog.alert({
                    title: "Fast Context auth",
                    message: sources.length === 0
                        ? "No credential configured. Set TYPESAFE_API_KEY or run /fast-context auth to store a key."
                        : ["Credential sources:", ...lines].join("\n"),
                });
            }
            catch {
                context.ui.toast.show({ title: "Fast Context", message: "Could not read credential status.", variant: "error" });
            }
        };
        const promptAndSave = async () => {
            const outcome = await collectKey({
                title: "Store a Fast Context credential",
                description: "Enter your TypeSafe API key. It is verified live, then saved in OpenCode's credential store. The key is never written to this project or your shell profile.",
            });
            if (outcome === "saved") {
                context.ui.toast.show({ title: "Fast Context", message: "Credential updated.", variant: "success" });
            }
        };
        const revoke = async () => {
            const confirmed = await context.ui.dialog.confirm({
                title: "Revoke Fast Context credential?",
                message: "This removes every Fast Context key stored in OpenCode's credential store. TYPESAFE_API_KEY in the environment is not affected.",
                label: { confirm: "Revoke", cancel: "Keep" },
            });
            if (!confirmed)
                return;
            try {
                await removeAllFastContextCredentials(api.credential);
                context.ui.toast.show({ title: "Fast Context", message: "Stored credential revoked.", variant: "success" });
            }
            catch {
                context.ui.toast.show({ title: "Fast Context", message: "Could not revoke the credential.", variant: "error" });
            }
        };
        const runAuthCommand = async (input) => {
            const command = parseAuthCommand(input ?? "");
            switch (command.action) {
                case "set":
                    await promptAndSave();
                    return;
                case "status":
                    await showStatus();
                    return;
                case "revoke":
                    await revoke();
                    return;
                case "help":
                    await context.ui.dialog.alert({
                        title: "Fast Context auth",
                        message: "/fast-context auth - store or replace the TypeSafe key\n/fast-context auth status - show credential sources\n/fast-context auth revoke - remove stored keys",
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
                    description: "Store, inspect, or revoke the TypeSafe credential",
                    group: "Fast Context",
                    palette: true,
                    slash: { name: "fast-context", arguments: true },
                    run: async (input) => {
                        refreshAttachment();
                        await runAuthCommand(input ?? "");
                    },
                },
            ],
        }));
        return () => {
            unsubscribeRequest();
            unsubscribeViewed();
            unsubscribeCreated();
            void client.detach({}).catch(() => { });
        };
    },
});
