import type { ToolContext } from "@opencode-ai/plugin/tool";
/**
 * OpenCode 1.x plugin entry point. OpenCode 2.x loads `src/index.ts` instead.
 *
 * Configure in `opencode.json`:
 *
 *   { "plugin": [["opencode-fast-context", { "provider": "jev" }]] }
 */
export declare const FastContextPlugin: (_input: unknown, options?: unknown) => Promise<{
    tool: {
        fast_context_search: {
            description: string;
            args: {
                query: import("zod").ZodString;
                maxFiles: import("zod").ZodOptional<import("zod").ZodNumber>;
            };
            execute(args: {
                query: string;
                maxFiles?: number | undefined;
            }, context: ToolContext): Promise<import("@opencode-ai/plugin").ToolResult>;
        };
    };
}>;
