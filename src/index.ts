import type { FastContextConfig } from "./config.ts";
import {
  TOOL_DESCRIPTION,
  TOOL_INPUT_SCHEMA,
  formatForModel,
  runFastContext,
} from "./tool.ts";

interface ToolEditor {
  add(tool: {
    name: string;
    description: string;
    input: unknown;
    options?: { codemode?: boolean };
    execute: (input: { query: string; maxFiles?: number }, context: { signal?: AbortSignal }) => Promise<{
      content: string;
      metadata?: Record<string, unknown>;
    }>;
  }): void;
}

interface ToolRegistration {
  dispose?: () => Promise<void> | void;
}

interface PluginContext {
  location: { directory: string; project?: { directory?: string | null } };
  options?: Record<string, unknown>;
  tool: {
    transform(fn: (editor: ToolEditor) => void): Promise<ToolRegistration>;
  };
}

/** OpenCode 2.x plugin entry point. */
export default {
  id: "fast-context",
  async setup(ctx: PluginContext): Promise<() => Promise<void>> {
    const config = (ctx.options ?? {}) as FastContextConfig;
    const root = ctx.location.project?.directory || ctx.location.directory;

    const registration = await ctx.tool.transform((editor) => {
      editor.add({
        name: "fast_context_search",
        description: TOOL_DESCRIPTION,
        input: TOOL_INPUT_SCHEMA,
        options: { codemode: false },
        execute: async (input, toolContext) => {
          const result = await runFastContext({
            root,
            query: input.query,
            config,
            ...(input.maxFiles ? { maxFiles: input.maxFiles } : {}),
            ...(toolContext.signal ? { signal: toolContext.signal } : {}),
          });
          return {
            content: formatForModel(result),
            metadata: { fast_context: result },
          };
        },
      });
    });

    return async () => {
      await registration?.dispose?.();
    };
  },
};

export { FastContextPlugin } from "./legacy.ts";
