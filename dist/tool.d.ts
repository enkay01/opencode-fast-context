import { type FastContextConfig, type ProviderOverrides } from "./config.ts";
import type { SearchResult } from "./types.ts";
export interface RunOptions {
    root: string;
    query: string;
    maxFiles?: number;
    config?: FastContextConfig;
    /** Internal test seam. Never populated from plugin options. */
    overrides?: ProviderOverrides;
    signal?: AbortSignal;
}
export declare function runFastContext(options: RunOptions): Promise<SearchResult>;
export declare function readAutoInvoke(config: FastContextConfig | undefined): "suggest" | "off";
export declare const TOOL_DESCRIPTION: string;
export declare const TOOL_INPUT_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["query"];
    readonly properties: {
        readonly query: {
            readonly type: "string";
            readonly minLength: 2;
            readonly description: string;
        };
        readonly maxFiles: {
            readonly type: "integer";
            readonly minimum: 1;
            readonly maximum: 20;
            readonly description: string;
        };
    };
};
export declare function formatForModel(result: SearchResult): string;
