import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "../src/index.ts";
import { AUTO_INVOKE_GUIDANCE } from "../src/guidance.ts";
import { makeFixture } from "./fixture.ts";

interface FakeContext {
  location: { directory: string };
  options?: Record<string, unknown>;
  storage: { get: (key: string) => Promise<undefined>; set: (key: string, value: string) => Promise<void> };
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
  let rpcHandlers: Record<string, (input: unknown) => Promise<unknown>> = {};
  const context: FakeContext = {
    location: { directory: root },
    ...(options ? { options } : {}),
    storage: { get: async () => undefined, set: async () => undefined },
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
      register: async (_definition, handlers) => {
        rpcHandlers = handlers;
        return {
          dispose: async () => undefined,
          events: { emit: async () => undefined },
        };
      },
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
  return { context, tools, hooks, integrations, methods, rpcHandlers: () => rpcHandlers };
}

test("OpenCode 2 setup registers the tool and one replayable guidance hook", async () => {
  const fixture = await makeFixture({ "src/a.ts": "export const a = 1\n" });
  try {
    const { context, tools, hooks, integrations, methods } = makeContext(fixture.root);
    await plugin.setup(context as never);

    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "fast_context_search");
    assert.deepEqual(integrations, ["fast-context", "fast-context-gemini"]);
    assert.equal(methods.length, 2);

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

test("local fallback leaves provider connection status unverified", async () => {
  const fixture = await makeFixture({
    "src/private-key.ts": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n",
  });
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    const { context, tools, rpcHandlers } = makeContext(fixture.root, { decisionProvider: "gemini" });
    await plugin.setup(context as never);
    const invoke = tools[0]!.execute as (input: unknown, toolContext: unknown) => Promise<{
      metadata: { fast_context: { status: string; reason?: string } };
    }>;
    const result = await invoke({ query: "private key" }, { sessionID: "session-1" });
    const status = await rpcHandlers().status!({}) as { connection: string; failure?: string };

    assert.equal(result.metadata.fast_context.status, "fallback_required");
    assert.match(result.metadata.fast_context.reason ?? "", /no candidate passed outbound content filtering/);
    assert.equal(status.connection, "unverified");
    assert.equal(status.failure, undefined);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    await fixture.cleanup();
  }
});

test("provider request failure marks the selected connection unavailable", async () => {
  const fixture = await makeFixture({ "src/retry.ts": "export function retryDelay() { return 1 }\n" });
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-key";
  globalThis.fetch = (async () => Response.json({ error: "service unavailable" }, { status: 503 })) as typeof fetch;
  try {
    const { context, tools, rpcHandlers } = makeContext(fixture.root, { decisionProvider: "gemini" });
    await plugin.setup(context as never);
    const invoke = tools[0]!.execute as (input: unknown, toolContext: unknown) => Promise<{
      metadata: { fast_context: { status: string; reason?: string } };
    }>;
    const result = await invoke({ query: "retryDelay" }, { sessionID: "session-1" });
    const status = await rpcHandlers().status!({}) as { connection: string; failure?: string };

    assert.equal(result.metadata.fast_context.status, "fallback_required");
    assert.match(result.metadata.fast_context.reason ?? "", /decision provider gemini failed: .*HTTP 503/);
    assert.equal(status.connection, "error");
    assert.equal(status.failure, "provider unavailable");
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    globalThis.fetch = previousFetch;
    await fixture.cleanup();
  }
});
