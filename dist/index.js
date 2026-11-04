import { Plugin } from "@opencode/plugin";
import { readPublicConfig } from "./config.js";
import { applyAutoInvokeGuidance } from "./guidance.js";
import { TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA, formatForModel, runFastContext, } from "./tool.js";
/** OpenCode 2 plugin entry point. */
export default Plugin.define({
    id: "fast-context",
    async setup(ctx) {
        const config = readPublicConfig(ctx.options);
        const root = ctx.location.project?.directory || ctx.location.directory;
        const toolRegistration = await ctx.tool.transform((editor) => {
            editor.add({
                name: "fast_context_search",
                description: TOOL_DESCRIPTION,
                input: TOOL_INPUT_SCHEMA,
                options: { codemode: false },
                execute: async (rawInput, toolContext) => {
                    const input = rawInput;
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
        const guidanceRegistration = config.autoInvoke === "off"
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
