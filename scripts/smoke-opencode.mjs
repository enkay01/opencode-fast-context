#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plugin from "../dist/index.js";
import { AUTO_INVOKE_GUIDANCE } from "../dist/guidance.js";
import { TOOL_DESCRIPTION, TOOL_INPUT_SCHEMA } from "../dist/tool.js";

const DUMMY_KEY = "dummy-smoke-key";
const root = await mkdtemp(join(tmpdir(), "fast-context-smoke-"));

const integration = {
  transform: async (fn) => {
    fn({
      update: (_id, apply) => apply({ id: "fast-context", name: "" }),
      method: { update: () => undefined },
    });
    return { dispose: async () => undefined };
  },
  connection: {
    active: async () => undefined,
    resolve: async () => undefined,
  },
  connect: { key: async () => ({}) },
};

const rpc = {
  register: async () => ({
    dispose: async () => undefined,
    events: { emit: async () => undefined },
  }),
};

try {
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "retry.ts"), "export function retryDelay() { return 100 }\n");

  process.env.TYPESAFE_API_KEY = DUMMY_KEY;
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    return new Response(
      JSON.stringify({
        model: "jev-smoke",
        answers: { relevant: { type: "noul", noul: 0.9 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const tools = [];
  const hooks = [];
  await plugin.setup({
    location: { directory: root },
    options: {},
    integration,
    rpc,
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
  assert.equal(tools[0].description, TOOL_DESCRIPTION);
  assert.deepEqual(tools[0].input, TOOL_INPUT_SCHEMA);
  assert.equal(tools[0].input.required[0], "query");
  assert.equal(tools[0].input.properties.maxFiles.maximum, 20);
  assert.equal(hooks.length, 1);
  assert.equal(fetches, 0, "context preparation must not call Jev");

  const system = [];
  hooks[0]({ system });
  hooks[0]({ system });
  assert.deepEqual(system, [{ type: "text", text: AUTO_INVOKE_GUIDANCE }]);

  const output = await tools[0].execute({ query: "Where is retryDelay computed?" }, {});
  assert.match(output.content, /status: complete/);
  assert.match(output.content, /src\/retry\.ts/);
  assert.ok(!output.content.includes(DUMMY_KEY));

  const offTools = [];
  const offHooks = [];
  await plugin.setup({
    location: { directory: root },
    options: { autoInvoke: "off" },
    integration,
    rpc,
    tool: {
      transform: async (fn) => {
        fn({
          add: (tool) => offTools.push(tool),
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
        offHooks.push(callback);
        return { dispose: async () => undefined };
      },
    },
  });
  assert.equal(offTools.length, 1);
  assert.equal(offTools[0].description, TOOL_DESCRIPTION);
  assert.equal(offHooks.length, 0);

  globalThis.fetch = originalFetch;
  console.log("smoke: OpenCode 2 API registration, contract capture, suggest/off, and tool call passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
