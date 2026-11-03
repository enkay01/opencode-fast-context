import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "../src/index.ts";
import { AUTO_INVOKE_GUIDANCE } from "../src/guidance.ts";
import { makeFixture } from "./fixture.ts";

interface FakeContext {
  location: { directory: string };
  options?: Record<string, unknown>;
  tool: {
    transform: (fn: (editor: { add(tool: unknown): void }) => void) => Promise<{ dispose(): Promise<void> }>;
  };
  session: {
    hook: (
      name: string,
      callback: (input: { system: Array<{ type: "text"; text: string }> }) => void,
    ) => Promise<{ dispose(): Promise<void> }>;
  };
}

function makeContext(root: string, options?: Record<string, unknown>) {
  const tools: any[] = [];
  const hooks: Array<(input: { system: Array<{ type: "text"; text: string }> }) => void> = [];
  const context: FakeContext = {
    location: { directory: root },
    ...(options ? { options } : {}),
    tool: {
      transform: async (fn) => {
        const editor = {
          add: (tool: unknown) => tools.push(tool),
          list: () => [],
          get: () => undefined,
          namespace: () => undefined,
          update: () => undefined,
          remove: () => undefined,
        };
        fn(editor as never);
        return { dispose: async () => undefined };
      },
    },
    session: {
      hook: async (_name, callback) => {
        hooks.push(callback);
        return { dispose: async () => undefined };
      },
    },
  };
  return { context, tools, hooks };
}

test("OpenCode 2 setup registers the tool and one replayable guidance hook", async () => {
  const fixture = await makeFixture({ "src/a.ts": "export const a = 1\n" });
  try {
    const { context, tools, hooks } = makeContext(fixture.root);
    await plugin.setup(context as never);

    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "fast_context_search");

    assert.equal(hooks.length, 1);
    const originalFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (async () => {
      fetches += 1;
      throw new Error("guidance must not call the provider");
    }) as typeof fetch;
    try {
      const system: Array<{ type: "text"; text: string }> = [];
      hooks[0]!({ system });
      hooks[0]!({ system });
      assert.deepEqual(system, [{ type: "text", text: AUTO_INVOKE_GUIDANCE }]);
      assert.equal(fetches, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    await fixture.cleanup();
  }
});

test("autoInvoke off registers no context hook", async () => {
  const fixture = await makeFixture({ "src/a.ts": "export const a = 1\n" });
  try {
    const { context, tools, hooks } = makeContext(fixture.root, { autoInvoke: "off" });
    await plugin.setup(context as never);
    assert.equal(tools.length, 1);
    assert.equal(hooks.length, 0);
  } finally {
    await fixture.cleanup();
  }
});
