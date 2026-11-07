import { randomUUID } from "node:crypto";
/** A pending prompt is abandoned after this long so a search can never hang. */
export const DEFAULT_AUTH_REQUEST_TIMEOUT_MS = 120_000;
/**
 * Server-side bridge between fast_context_search and an interactive TUI.
 *
 * A search may only prompt when its own session is shown by an attached
 * client. Headless runs and subagent sessions are not attached, so they return
 * "unavailable" immediately instead of waiting on an unrelated window.
 */
export function createAuthBroker(options) {
    const pending = new Map();
    const rejected = new Set();
    let emit;
    let sessions = new Set();
    let attached = false;
    let disposed = false;
    const timeoutMs = options.timeoutMs ?? DEFAULT_AUTH_REQUEST_TIMEOUT_MS;
    const settle = (requestId, outcome) => {
        pending.get(requestId)?.settle(outcome);
        return { ok: true };
    };
    const settleAll = (outcome) => {
        for (const request of [...pending.values()])
            request.settle(outcome);
    };
    const rejectActive = async () => {
        const credentialID = await options.activeCredentialID?.();
        if (credentialID)
            rejected.add(credentialID);
    };
    const broker = {
        resolveStored: async () => {
            if (rejected.size > 0 && options.activeCredentialID) {
                const credentialID = await options.activeCredentialID().catch(() => undefined);
                if (credentialID && rejected.has(credentialID))
                    return undefined;
            }
            return options.resolveStored();
        },
        requestAuth: async (reason, signal, sessionID) => {
            if (disposed || !attached || !emit)
                return "unavailable";
            if (!sessionID || !sessions.has(sessionID))
                return "unavailable";
            const requestId = randomUUID();
            return new Promise((resolve) => {
                let timer;
                const finish = (outcome) => {
                    if (!pending.has(requestId))
                        return;
                    pending.delete(requestId);
                    if (timer)
                        clearTimeout(timer);
                    signal?.removeEventListener("abort", onAbort);
                    resolve(outcome);
                };
                const onAbort = () => finish("cancelled");
                if (signal?.aborted) {
                    resolve("cancelled");
                    return;
                }
                signal?.addEventListener("abort", onAbort, { once: true });
                timer = setTimeout(() => finish("cancelled"), timeoutMs);
                pending.set(requestId, { settle: finish });
                Promise.resolve()
                    .then(() => emit({ requestId, reason }))
                    .catch(() => finish("unavailable"));
            });
        },
        discardStored: rejectActive,
    };
    return {
        broker,
        attach: (interactiveSessions) => {
            attached = true;
            sessions = new Set(interactiveSessions);
            return { remove: [...rejected] };
        },
        detach: () => {
            attached = false;
            sessions = new Set();
            settleAll("cancelled");
        },
        acknowledge: (credentialIDs) => {
            for (const credentialID of credentialIDs)
                rejected.delete(credentialID);
        },
        clearRejected: () => {
            rejected.clear();
        },
        settle,
        setEmit: (next) => {
            emit = next;
        },
        dispose: () => {
            disposed = true;
            attached = false;
            sessions = new Set();
            settleAll("cancelled");
        },
        pendingCount: () => pending.size,
    };
}
