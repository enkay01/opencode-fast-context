export type AutoInvoke = "suggest" | "off";

export const AUTO_INVOKE_GUIDANCE =
  "For repository questions that require locating behavior across unknown files, call " +
  "`fast_context_search` before broad iterative search. Do not call it when the user supplied the file, " +
  "for a direct known-file read, or after it has already answered the question. If it returns `no_match` " +
  "or `fallback_required`, continue with ordinary search.";

export function normalizeAutoInvoke(value: unknown): AutoInvoke {
  return value === "off" ? "off" : "suggest";
}

export interface SystemTextPart {
  type: "text";
  text: string;
}

/**
 * Add the tool-selection guidance once. Replaying the context hook must not duplicate it.
 */
export function applyAutoInvokeGuidance(
  system: ReadonlyArray<SystemTextPart>,
  mode: AutoInvoke,
): boolean {
  if (mode === "off") return false;
  if (system.some((part) => part.type === "text" && part.text === AUTO_INVOKE_GUIDANCE)) {
    return false;
  }
  (system as SystemTextPart[]).push({ type: "text", text: AUTO_INVOKE_GUIDANCE });
  return true;
}
