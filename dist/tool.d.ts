import { type FastContextConfig } from "./config.ts";
import type { SearchResult } from "./types.ts";
export interface RunOptions {
    root: string;
    query: string;
    maxFiles?: number;
    config?: FastContextConfig;
    signal?: AbortSignal;
}
export declare function runFastContext(options: RunOptions): Promise<SearchResult>;
export declare const TOOL_DESCRIPTION: string;
export declare const TOOL_INPUT_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["query"];
    readonly properties: {
        readonly query: {
            readonly type: "string";
            readonly minLength: 2;
            readonly description: "The code question or behavior to locate, in plain language or with identifiers.";
        };
        readonly maxFiles: {
            readonly type: "integer";
            readonly minimum: 1;
            readonly maximum: 20;
            readonly description: "Maximum number of files to return. Defaults to the configured limit.";
        };
    };
};
export declare function formatForModel(result: SearchResult): string;
