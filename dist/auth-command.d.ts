import type { ProviderKind } from "./config.ts";
export type AuthCommand = {
    action: "select" | "set" | "status" | "revoke" | "help";
    provider?: ProviderKind;
} | {
    action: "unknown";
    token: string;
};
/** `/fast-context` opens the picker; provider names can target either credential directly. */
export declare function parseAuthCommand(input: string): AuthCommand;
