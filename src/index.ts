import { Plugin } from "@opencode/plugin";
import { readPublicConfig } from "./config.ts";
import { applyAutoInvokeGuidance } from "./guidance.ts";
import {
  TOOL_DESCRIPTION,
  TOOL_INPUT_SCHEMA,
  formatForModel,
  runFastContext,
} from "./tool.ts";

/** OpenCode 2 plugin entry point. */
export default Plugin.define({
  id: "fast-context",
  async setup(ctx: Plugin.Context) {
    const config = readPublicConfig(ctx.options as Record<string, unknown> | undefined);
    const root = ctx.location.project?.directory || ctx.location.directory;

    const toolRegistration = await ctx.tool.transform((editor) => {
      editor.add({
        name: "fast_context_search",
        description: TOOL_DESCRIPTION,
        input: TOOL_INPUT_SCHEMA,
        options: { codemode: false },
        execute: async (rawInput, toolContext) => {
          const input = rawInput as { query: string; maxFiles?: number };
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

    const guidanceRegistration =
      config.autoInvoke === "off"
        ? null
        : await ctx.session.hook("context", (input) => {
            applyAutoInvokeGuidance(input.system, "suggest");
          });

    return async () => {
      await guidanceRegistration?.dispose();
      await toolRegistration.dispose();
    };
  },
});
