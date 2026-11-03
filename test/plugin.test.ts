import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "../src/index.ts";
import { makeFixture } from "./fixture.ts";

test("OpenCode 2.x setup registers one tool that returns verified citations", async () => {
  const fixture = await makeFixture({
    "src/retry.ts": "export function retryDelay(attempt: number) {\n  return attempt * 100\n}\n",
  });
  try {
    const tools: any[] = [];
    const dispose = await plugin.setup({
      location: { directory: fixture.root },
      tool: {
        transform: async (fn: (editor: { add(tool: unknown): void }) => void) => {
          fn({ add: (tool) => tools.push(tool) });
          return {};
        },
      },
    });

    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "fast_context_search");
    assert.equal(tools[0].options.codemode, false);

    const output = await tools[0].execute({ query: "Where is retryDelay computed?" }, {});
    assert.match(output.content, /status: complete/);
    assert.match(output.content, /src\/retry\.ts:1-\d+/);
    assert.equal(output.metadata.fast_context.provider.id, "none");

    await dispose();
  } finally {
    await fixture.cleanup();
  }
});
