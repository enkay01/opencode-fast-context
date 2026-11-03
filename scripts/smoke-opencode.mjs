#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plugin from "../dist/index.js";

const DUMMY_KEY = "dummy-smoke-key";
const root = await mkdtemp(join(tmpdir(), "fast-context-smoke-"));

try {
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "retry.ts"), "export function retryDelay() { return 100 }\n");

  process.env.TYPESAFE_API_KEY = DUMMY_KEY;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        model: "jev-smoke",
        answers: { relevant: { type: "noul", noul: 0.9 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const tools = [];
  const hooks = [];
  await plugin.setup({
    location: { directory: root },
    options: {},
    tool: {
      transform: async (fn) => {
        fn({
          add: (tool) => tools.push(tool),
          list: () => [],
          get: () => undefined,
          namespace: () => undefined,
          update: () => undefined,
          remove: () => undefined,
        });
        return { dispose: async () => undefined };
      },
    },
    session: {
      hook: async (_name, callback) => {
        hooks.push(callback);
        return { dispose: async () => undefined };
      },
    },
  });

  assert.equal(plugin.id, "fast-context");
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "fast_context_search");
  assert.equal(hooks.length, 1);

  const system = [];
  hooks[0]({ system });
  assert.equal(system.length, 1);

  const output = await tools[0].execute({ query: "Where is retryDelay computed?" }, {});
  assert.match(output.content, /status: complete/);
  assert.match(output.content, /src\/retry\.ts/);
  assert.ok(!output.content.includes(DUMMY_KEY));

  globalThis.fetch = originalFetch;
  console.log("smoke: OpenCode 2 API registration and tool call passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
