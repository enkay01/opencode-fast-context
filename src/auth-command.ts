/**
 * Parses the argument text OpenCode hands to the `fast-context` slash command.
 *
 * OpenCode passes everything after the slash name, so `/fast-context auth
 * status` arrives as `auth status`. The documented forms include the optional
 * `auth` word, so it is consumed before the action is read.
 */
export type AuthCommand =
  | { action: "set" | "status" | "revoke" | "help" }
  | { action: "unknown"; token: string };

type ExplicitAction = "set" | "status" | "revoke" | "help";

const ACTIONS: Record<string, ExplicitAction> = {
  "": "set",
  login: "set",
  set: "set",
  key: "set",
  status: "status",
  revoke: "revoke",
  logout: "revoke",
  remove: "revoke",
  help: "help",
};

export function parseAuthCommand(input: string): AuthCommand {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens[0]?.toLowerCase() === "auth") tokens.shift();
  const token = (tokens[0] ?? "").toLowerCase();
  const action = ACTIONS[token];
  return action ? { action } : { action: "unknown", token };
}
