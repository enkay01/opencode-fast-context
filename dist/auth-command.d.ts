/**
 * Parses the argument text OpenCode hands to the `fast-context` slash command.
 *
 * OpenCode passes everything after the slash name, so `/fast-context auth
 * status` arrives as `auth status`. The documented forms include the optional
 * `auth` word, so it is consumed before the action is read.
 */
export type AuthCommand = {
    action: "set" | "status" | "revoke" | "help";
} | {
    action: "unknown";
    token: string;
};
export declare function parseAuthCommand(input: string): AuthCommand;
