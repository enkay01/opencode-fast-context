import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "../src/index.ts";
import { AUTO_INVOKE_GUIDANCE } from "../src/guidance.ts";
import { makeFixture } from "./fixture.ts";

interface FakeContext {
  location: { directory: string };
  options?: Record<string, unknown>;
  storage: { get: (key: string) => Promise<string | undefined>; set: (key: string, value: string) => Promise<void>; remove: (key: string) => Promise<void> };
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
    storage: { get: async () => undefined, set: async () => undefined, remove: async () => undefined },
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

test("selection is refreshed across instances and restart, with one snapshot per search", async (t) => {
  const fixture = await makeFixture({ "src/retry.ts": "export const retryDelay = 1\n" });
  t.after(fixture.cleanup);
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (url.endsWith("/models")) return Response.json({});
    const { questions } = JSON.parse(String(init?.body));
    if (Object.hasOwn(questions, "relevant") && url.includes("googleapis") && blockGemini) {
      entered();
      await releaseGemini;
    }
    return Response.json({ answers: Object.fromEntries(Object.keys(questions).map((id) => [id, { type: "noul", noul: 0.9 }])) });
  });
  for (const name of ["GEMINI_API_KEY", "TYPESAFE_API_KEY"]) {
    const previous = process.env[name];
    process.env[name] = "fixture-key";
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
  let stored: string | undefined;
  let blockGemini = false;
  const { promise: releaseGemini, resolve: release } = Promise.withResolvers<void>();
  const { promise: enteredGemini, resolve: entered } = Promise.withResolvers<void>();
  t.after(release);
  const storage = {
    get: async () => stored,
    set: async (_key: string, value: string) => { stored = value; },
    remove: async () => { stored = undefined; },
  };
  const setup = async () => {
    const mock = makeContext(fixture.root, { decisionProvider: "jev" });
    mock.context.storage = storage;
    const dispose = await plugin.setup(mock.context as never);
    return { dispose, rpc: mock.rpcHandlers(), search: () => mock.tools[0].execute({ query: "retryDelay" }, { sessionID: "fixture" }) };
  };
  const first = await setup();
  const second = await setup();
  t.after(second.dispose);
  const select = async (instance: typeof first, provider: "jev" | "gemini") => {
    const result = await instance.rpc.selectProvider!({ provider }) as { ok: boolean };
    assert.ok(result.ok);
  };

  await select(first, "gemini");
  const firstStatus = await first.rpc.status!({}) as { provider: string; instanceID: string };
  const secondStatus = await second.rpc.status!({}) as typeof firstStatus;
  assert.equal(secondStatus.provider, "gemini");
  assert.notEqual(secondStatus.instanceID, firstStatus.instanceID);

  blockGemini = true;
  const pending = second.search();
  await Promise.race([enteredGemini, pending.then(() => assert.fail("Gemini search did not reach the provider"))]);
  try {
    await select(first, "jev");
  } finally {
    release();
  }
  const result = await pending;
  assert.equal(result.metadata.fast_context.provider.id, "gemini");
  assert.equal(result.metadata.fast_context_instance, secondStatus.instanceID);
  assert.equal((await second.search()).metadata.fast_context.provider.id, "jev");

  await select(first, "gemini");
  await first.dispose?.();
  const restarted = await setup();
  t.after(restarted.dispose);
  assert.equal((await restarted.rpc.status!({}) as typeof firstStatus).provider, "gemini");
  assert.equal((await restarted.search()).metadata.fast_context.provider.id, "gemini");
});

test("invalid or unavailable selection storage prevents outbound work even with an initial choice", async (t) => {
  const { context, tools, rpcHandlers } = makeContext("/unused", { decisionProvider: "gemini" });
  const request = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected outbound request"); });
  t.after(await plugin.setup(context as never));
  for (const read of [
    { get: async () => "bad-provider", reason: /Stored provider selection is invalid/ },
    { get: async () => { throw new Error("private storage error"); }, reason: /Provider selection storage is unavailable/ },
  ]) {
    context.storage.get = read.get;
    await assert.rejects(rpcHandlers().status!({}), read.reason);
    const result = await tools[0].execute({ query: "retryDelay" }, { sessionID: "fixture" });
    assert.equal(result.metadata.fast_context.status, "fallback_required");
    assert.match(result.metadata.fast_context.reason, read.reason);
    assert.doesNotMatch(result.metadata.fast_context.reason, /private storage error/);
  }
  assert.equal(request.mock.callCount(), 0);
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

test("status reports Gemini verification and safe quota, timeout, and credential failures", async (t) => {
  const fixture = await makeFixture({ "src/retry.ts": "export const retryDelay = 1 // fixture-source-marker\n" });
  t.after(fixture.cleanup);
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "fixture-key-marker";
  t.after(() => {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  });
  const { context, tools, rpcHandlers } = makeContext(fixture.root, { decisionProvider: "gemini" });
  const events: unknown[] = [];
  const register = context.rpc.register;
  context.rpc.register = async (...args) => ({
    ...await register(...args),
    events: { emit: async (name, data) => { events.push({ name, data }); } },
  });
  t.after(await plugin.setup(context as never));
  const status = () => rpcHandlers().status!({}) as Promise<import("../src/auth-rpc.ts").AuthStatus>;
  const search = () => tools[0].execute({ query: "retryDelay" }, { sessionID: "fixture" });
  let httpStatus = 200;
  t.mock.method(globalThis, "fetch", async () => {
    if (httpStatus === 0) throw new DOMException("fixture-provider-body", "TimeoutError");
    if (httpStatus !== 200) return new Response("fixture-provider-body", { status: httpStatus });
    return Response.json({ answers: { relevant: { type: "noul", noul: 0.9 } } });
  });

  assert.equal((await status()).connection, "unverified");
  await search();
  const verified = await status();
  assert.equal(verified.connection, "connected");
  assert.equal(verified.source, "env");
  assert.ok(verified.verifiedAt);
  for (const [code, failure] of [[429, "429"], [0, "timeout"], [401, "401"], [403, "403"]] as const) {
    httpStatus = code;
    await search();
    const current = await status();
    assert.equal(current.provider, "gemini");
    assert.equal(current.connection, "error");
    assert.equal(current.failure, failure);
    assert.equal(current.verifiedAt, verified.verifiedAt);
    assert.doesNotMatch(JSON.stringify(current), /fixture-(?:key-marker|source-marker|provider-body)/);
  }
  assert.deepEqual(events, Array.from({ length: 5 }, () => ({ name: "state", data: {} })));
});
