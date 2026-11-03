interface ToolEditor {
    add(tool: {
        name: string;
        description: string;
        input: unknown;
        options?: {
            codemode?: boolean;
        };
        execute: (input: {
            query: string;
            maxFiles?: number;
        }, context: {
            signal?: AbortSignal;
        }) => Promise<{
            content: string;
            metadata?: Record<string, unknown>;
        }>;
    }): void;
}
interface ToolRegistration {
    dispose?: () => Promise<void> | void;
}
interface PluginContext {
    location: {
        directory: string;
        project?: {
            directory?: string | null;
        };
    };
    options?: Record<string, unknown>;
    tool: {
        transform(fn: (editor: ToolEditor) => void): Promise<ToolRegistration>;
    };
}
/** OpenCode 2.x plugin entry point. */
declare const _default: {
    id: string;
    setup(ctx: PluginContext): Promise<() => Promise<void>>;
};
export default _default;
export { FastContextPlugin } from "./legacy.ts";
