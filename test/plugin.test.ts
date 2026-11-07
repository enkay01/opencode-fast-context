import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "../src/index.ts";
import { AUTO_INVOKE_GUIDANCE } from "../src/guidance.ts";
import { makeFixture } from "./fixture.ts";

interface FakeContext {
  location: { directory: string };
  options?: Record<string, unknown>;
  integration: {
    transform: (fn: (editor: {
      update: (id: string, fn: (item: { id: string; name: string }) => void) => void;
      method: { update: (input: unknown) => void };
    }) => void) => Promise<{ dispose(): Promise<void> }>;
    connection: {
      active: (id: string) => Promise<unknown>;
      resolve: (connection: unknown) => Promise<unknown>;
    };
    connect: { key: (input: unknown) => Promise<unknown> };
  };
  rpc: {
    register: (definition: unknown, handlers: Record<string, (input: unknown) => Promise<unknown>>) => Promise<{
      dispose: () => Promise<void>;
      events: { emit: (name: string, data: unknown) => Promise<void> };
    }>;
  };
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
  const integrations: string[] = [];
  const methods: unknown[] = [];
  const context: FakeContext = {
    location: { directory: root },
    ...(options ? { options } : {}),
    integration: {
      transform: async (fn) => {
        const editor = {
          update: (id: string, apply: (item: { id: string; name: string }) => void) => {
            integrations.push(id);
            apply({ id, name: "" });
          },
          method: {
            update: (input: unknown) => {
              methods.push(input);
            },
          },
        };
        fn(editor);
        return { dispose: async () => undefined };
      },
      connection: {
        active: async () => undefined,
        resolve: async () => undefined,
      },
      connect: { key: async () => ({}) },
    },
    rpc: {
      register: async (_definition, _handlers) => ({
        dispose: async () => undefined,
        events: { emit: async () => undefined },
      }),
    },
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
  return { context, tools, hooks, integrations, methods };
}

test("OpenCode 2 setup registers the tool and one replayable guidance hook", async () => {
  const fixture = await makeFixture({ "src/a.ts": "export const a = 1\n" });
  try {
    const { context, tools, hooks, integrations, methods } = makeContext(fixture.root);
    await plugin.setup(context as never);

    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "fast_context_search");
    assert.deepEqual(integrations, ["fast-context"]);
    assert.equal(methods.length, 1);

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
