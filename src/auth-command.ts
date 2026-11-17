import type { ProviderKind } from "./config.ts";

export type AuthCommand =
  | { action: "select" | "set" | "status" | "revoke" | "help"; provider?: ProviderKind }
  | { action: "unknown"; token: string };

/** `/fast-context` opens the picker; provider names can target either credential directly. */
export function parseAuthCommand(input: string): AuthCommand {
  const tokens = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hadAuth = tokens[0] === "auth";
  if (hadAuth) tokens.shift();
  const action = tokens[0] ?? "";
  const target = tokens[1];
  const provider = (value: string | undefined): ProviderKind | undefined =>
    value === "jev" || value === "gemini" ? value : undefined;
  if (!action && hadAuth) return { action: "set" };
  const direct = provider(action);
  if (hadAuth && direct) return { action: "set", provider: direct };
  if (!action || action === "provider" || action === "use" || provider(action)) {
    const requested = provider(action) ?? provider(target);
    return requested ? { action: "select", provider: requested } : { action: "select" };
  }
  const actions: Record<string, "set" | "status" | "revoke" | "help"> = {
    login: "set", set: "set", key: "set", status: "status", revoke: "revoke",
    logout: "revoke", remove: "revoke", help: "help",
  };
  const resolved = actions[action];
  if (!resolved || (target && !provider(target))) return { action: "unknown", token: target ?? action };
  const selected = provider(target);
  return selected ? { action: resolved, provider: selected } : { action: resolved };
}
