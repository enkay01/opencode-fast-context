import { type DecisionProvider } from "./types.ts";
export interface JevConfig {
    apiKey: string;
    model?: string;
    /** Internal test seam; production always uses the fixed TypeSafe endpoint. */
    baseUrl?: string;
    /** Internal test seam for mocked transports. */
    fetchImpl?: typeof fetch;
}
export declare function createJevProvider(config: JevConfig): DecisionProvider;
export interface ClefConfig {
    apiToken: string;
    accountId: string;
    model?: string;
    baseUrl?: string;
}
export declare function createClefProvider(config: ClefConfig): DecisionProvider;
