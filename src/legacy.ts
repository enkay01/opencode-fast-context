import { tool } from "@opencode-ai/plugin";
import type { ToolContext } from "@opencode-ai/plugin/tool";
import type { FastContextConfig } from "./config.ts";
import { formatForModel, runFastContext } from "./tool.ts";

/**
 * OpenCode 1.x plugin entry point. OpenCode 2.x loads `src/index.ts` instead.
 *
 * Configure in `opencode.json`:
 *
 *   { "plugin": [["opencode-fast-context", { "provider": "jev" }]] }
 */
export const FastContextPlugin = async (_input: unknown, options?: unknown) => {
  const config = (options ?? {}) as FastContextConfig;
  return {
    tool: {
      fast_context_search: tool({
        description:
          "Find the files and line ranges in this repository that answer a code question. " +
          "Returns compact verified citations, or fallback_required if the decision provider fails.",
        args: {
          query: tool.schema.string().min(2).describe("The code question or behavior to locate."),
          maxFiles: tool.schema.number().int().min(1).max(20).optional().describe("Maximum files to return."),
        },
        async execute(args, context: ToolContext) {
          const result = await runFastContext({
            root: context.worktree || context.directory,
            query: args.query,
            config,
            ...(args.maxFiles ? { maxFiles: args.maxFiles } : {}),
            signal: context.abort,
          });
          return {
            title: `fast_context_search: ${result.status} (${result.results.length} files, ${result.timings.total}ms)`,
            output: formatForModel(result),
            metadata: { fast_context: result },
          };
        },
      }),
    },
  };
};
