/** Integration ID under which Fast Context stores the TypeSafe / Jev key. */
export const FAST_CONTEXT_INTEGRATION_ID = "fast-context";
export const FAST_CONTEXT_INTEGRATION_NAME = "Fast Context (TypeSafe Jev)";
/**
 * Registers the Fast Context integration and its key method so OpenCode's
 * credential store accepts and resolves TypeSafe keys for this plugin.
 */
export async function registerFastContextIntegration(integration) {
    return integration.transform((editor) => {
        editor.update(FAST_CONTEXT_INTEGRATION_ID, (item) => {
            item.name = FAST_CONTEXT_INTEGRATION_NAME;
        });
        editor.method.update({
            integrationID: FAST_CONTEXT_INTEGRATION_ID,
            method: { type: "key", label: "TypeSafe API key" },
        });
    });
}
/** Returns the active stored key, or undefined when none resolves to a key credential. */
export async function resolveStoredApiKey(integration) {
    const connection = await integration.connection.active(FAST_CONTEXT_INTEGRATION_ID);
    if (!connection)
        return undefined;
    const credential = await integration.connection.resolve(connection);
    if (credential?.type !== "key" || typeof credential.key !== "string" || credential.key.length === 0) {
        return undefined;
    }
    return credential.key;
}
/** Whether any credential connection is active for the Fast Context integration. */
export async function hasStoredCredential(integration) {
    return (await integration.connection.active(FAST_CONTEXT_INTEGRATION_ID)) !== undefined;
}
/** Persists a validated key through OpenCode's integration credential store. */
export async function storeApiKey(integration, apiKey) {
    await integration.connect.key({
        integrationID: FAST_CONTEXT_INTEGRATION_ID,
        key: apiKey,
        label: FAST_CONTEXT_INTEGRATION_NAME,
    });
}
const DEFAULT_VERIFY_TIMEOUT_MS = 5000;
/**
 * Probes the TypeSafe API with the candidate key before it is persisted.
 * GET /v1/models is the documented lightweight discovery endpoint: a 2xx
 * proves the key works, 401/403 proves it does not, and anything else
 * (network failure, timeout, unexpected status) is "unverified".
 */
export async function verifyApiKey(apiKey, options = {}) {
    const baseUrl = (options.endpoint ?? "https://api.typesafe.ai").replace(/\/+$/, "");
    const fetchImpl = options.fetchImpl ?? fetch;
    const signals = [AbortSignal.timeout(options.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS)];
    if (options.signal)
        signals.push(options.signal);
    let response;
    try {
        response = await fetchImpl(`${baseUrl}/v1/models`, {
            method: "GET",
            headers: { authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.any(signals),
        });
    }
    catch {
        return "unverified";
    }
    if (response.ok)
        return "valid";
    if (response.status === 401 || response.status === 403)
        return "invalid";
    return "unverified";
}
export function verificationErrorMessage(result) {
    if (result === "invalid") {
        return "TypeSafe rejected this key (HTTP 401/403). Check the key and try again.";
    }
    return "Could not reach TypeSafe to verify the key. Check your connection and try again.";
}
/** Fast Context records within a `credential.list()` result; other integrations are ignored. */
export function fastContextCredentialEntries(entries) {
    return entries.filter((entry) => entry.integrationID === FAST_CONTEXT_INTEGRATION_ID);
}
/**
 * Records a replacement should remove: every Fast Context credential except
 * the one that stays active (the active entry, or the first when none is
 * marked active). connect.key appends records, so duplicates must be pruned
 * explicitly through `credential.remove`.
 */
export function replacementRemoval(entries) {
    const ours = fastContextCredentialEntries(entries);
    const keep = ours.find((entry) => entry.active) ?? ours[0];
    return ours.filter((entry) => entry !== keep);
}
async function removeEntries(api, entries) {
    const removed = [];
    for (const entry of entries) {
        await api.remove({ credentialID: entry.id });
        removed.push(entry.id);
    }
    return removed;
}
/**
 * Removes stale Fast Context records after a verified save while keeping the
 * newly active credential. Returns the removed credential IDs.
 */
export async function removeStaleFastContextCredentials(api) {
    return removeEntries(api, replacementRemoval(await api.list()));
}
/**
 * Removes every Fast Context record. Used on expiry and revoke so a rejected
 * key cannot be resolved again. Returns the removed credential IDs.
 */
export async function removeAllFastContextCredentials(api) {
    return removeEntries(api, fastContextCredentialEntries(await api.list()));
}
/**
 * Removes the named Fast Context records, ignoring IDs that belong to another
 * integration or no longer exist. Returns the removed credential IDs.
 */
export async function removeFastContextCredentials(api, credentialIDs) {
    const wanted = new Set(credentialIDs);
    const entries = fastContextCredentialEntries(await api.list()).filter((entry) => wanted.has(entry.id));
    return removeEntries(api, entries);
}
