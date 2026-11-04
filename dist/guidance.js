export const AUTO_INVOKE_GUIDANCE = "For repository tasks that need locating relevant files across unknown directories, call " +
    "`fast_context_search` before broad iterative search. Use a focused query with known domain names, " +
    "symbols, or behavior; name the target file only if you already know it. Do not call it when you have " +
    "supplied the file or need a direct known-file read. If it returns `no_match` or `fallback_required`, " +
    "continue with ordinary search. For current status or a missing artifact, also inspect the relevant " +
    "directories and version-control state.";
export function normalizeAutoInvoke(value) {
    return value === "off" ? "off" : "suggest";
}
/**
 * Add the tool-selection guidance once. Replaying the context hook must not duplicate it.
 */
export function applyAutoInvokeGuidance(system, mode) {
    if (mode === "off")
        return false;
    if (system.some((part) => part.type === "text" && part.text === AUTO_INVOKE_GUIDANCE)) {
        return false;
    }
    system.push({ type: "text", text: AUTO_INVOKE_GUIDANCE });
    return true;
}
