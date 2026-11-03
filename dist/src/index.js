import { TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA, formatForModel, runFastContext, } from "./tool.js";
/** OpenCode 2.x plugin entry point. */
export default {
    id: "fast-context",
    async setup(ctx) {
        const config = (ctx.options ?? {});
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
export { FastContextPlugin } from "./legacy.js";
//# sourceMappingURL=index.js.map