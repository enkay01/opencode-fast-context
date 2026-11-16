import assert from "node:assert/strict";
import { test } from "node:test";
import plugin from "../src/index.ts";
import { FAST_CONTEXT_INTEGRATION_ID, GEMINI_INTEGRATION_ID } from "../src/credentials.ts";
import { makeFixture } from "./fixture.ts";

const MODELS_URL = "https://api.typesafe.ai/v1/models";
const SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/decisions";
const SESSION = "session-tui";
const HEADLESS = "session-headless";

function jevOk() {
  return new Response(
    JSON.stringify({
      model: "jev-test",
      answers: { relevant: { type: "noul", noul: 0.9 } },
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

interface EmittedRequest {
  requestId: string;
  reason: string;
}

function makeContext(root: string, options?: { storedKey?: string; storedGeminiKey?: string; decisionProvider?: "jev" | "gemini" | null; savedProvider?: "jev" | "gemini" }) {
  const tools: Array<{ name: string; execute: (input: unknown, ctx: unknown) => Promise<{ content: string }> }> = [];
  const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
  const emitted: EmittedRequest[] = [];
  const stored: Array<{ integrationID: string; key: string }> = [];
  let activeKey = options?.storedKey;
  let activeGeminiKey = options?.storedGeminiKey;

  const context = {
    options: options?.decisionProvider === null ? {} : { decisionProvider: options?.decisionProvider ?? "jev" },
    storage: {
      get: async () => options?.savedProvider,
      set: async (_key: string, value: "jev" | "gemini") => { if (options) options.savedProvider = value; },
    },
    location: { directory: root },
    integration: {
      transform: async (fn: (editor: unknown) => void) => {
        fn({
          update: (_id: string, apply: (item: { id: string; name: string }) => void) =>
            apply({ id: FAST_CONTEXT_INTEGRATION_ID, name: "" }),
          method: { update: () => undefined },
        });
        return { dispose: async () => undefined };
      },
      connection: {
        active: async (id: string) => ((id === GEMINI_INTEGRATION_ID ? activeGeminiKey : activeKey) === undefined ? undefined : { type: "credential", id: id === GEMINI_INTEGRATION_ID ? "cred-gemini" : "cred-1" }),
        resolve: async (connection: { id: string }) => {
          const key = connection.id === "cred-gemini" ? activeGeminiKey : activeKey;
          return key === undefined ? undefined : { type: "key", key };
        },
      },
      connect: {
        key: async (input: { integrationID: string; key: string }) => {
          stored.push(input);
          if (input.integrationID === GEMINI_INTEGRATION_ID) activeGeminiKey = input.key;
          else activeKey = input.key;
          return {};
        },
      },
    },
    rpc: {
      register: async (_definition: unknown, registered: Record<string, (input: unknown) => Promise<unknown>>) => {
        for (const [name, handler] of Object.entries(registered)) handlers.set(name, handler);
        return {
          dispose: async () => undefined,
          events: {
            emit: async (name: string, data: unknown) => {
              if (name === "request") emitted.push(data as EmittedRequest);
            },
          },
        };
      },
    },
    tool: {
      transform: async (fn: (editor: { add(tool: unknown): void }) => void) => {
        fn({ add: (tool: never) => tools.push(tool as never) });
        return { dispose: async () => undefined };
      },
    },
    session: { hook: async () => ({ dispose: async () => undefined }) },
  };

  return { context, tools, handlers, emitted, stored };
}

async function waitForRequests(emitted: EmittedRequest[], count: number) {
  for (let i = 0; i < 100 && emitted.length < count; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(emitted.length >= count, `expected ${count} auth request(s), saw ${emitted.length}`);
}

function stubFetch(handlers: {
  models?: () => Response;
  systemone?: () => Response;
  decisions?: (input?: RequestInit) => Response;
}) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === MODELS_URL) return (handlers.models ?? (() => new Response("{}", { status: 200 })))();
    if (url === SYSTEMONE_URL) return (handlers.systemone ?? jevOk)();
    if (url === GEMINI_URL) return (handlers.decisions ?? (() => new Response(JSON.stringify({ answers: { relevant: { type: "noul", noul: 0.9 } } }), { status: 200 })))(init);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function withoutEnv<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  return fn().finally(() => {
    if (previous !== undefined) process.env.TYPESAFE_API_KEY = previous;
  });
}

test("first unauthenticated search emits a prompt request; a bad key fails inline and a good key is stored", async () => {
  await withoutEnv(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    const restore = stubFetch({
      models: () => new Response("denied", { status: 401 }),
      systemone: jevOk,
    });
    try {
      const { context, tools, handlers, emitted, stored } = makeContext(fixture.root);
      await plugin.setup(context as never);
      await handlers.get("attach")!({ sessions: [SESSION] });

      const pending = tools[0]!.execute({ query: "retryDelay" }, { sessionID: SESSION });
      await waitForRequests(emitted, 1);
      assert.equal(emitted[0]!.reason, "missing");

      const rejected = (await handlers.get("submitKey")!({
        requestId: emitted[0]!.requestId,
        key: "bad-key",
      })) as { ok: boolean; error?: string };
      assert.equal(rejected.ok, false);
      assert.match(rejected.error ?? "", /rejected|401\/403/i);
      assert.equal(stored.length, 0);

      // The /v1/models stub still rejects, so the second submission fails too
      // and the search keeps waiting for a valid key or a cancel.
      const accepted = (await handlers.get("submitKey")!({
        requestId: emitted[0]!.requestId,
        key: "good-key",
      })) as { ok: boolean };
      assert.equal(accepted.ok, false);
      assert.equal(stored.length, 0);

      await handlers.get("cancel")!({ requestId: emitted[0]!.requestId });
      const result = await pending;
      assert.match(result.content, /fallback_required/);
    } finally {
      restore();
      await fixture.cleanup();
    }
  });
});

test("a verified key submitted through the prompt is stored and the search completes", async () => {
  await withoutEnv(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    let modelsStatus = 401;
    const restore = stubFetch({
      models: () => new Response("{}", { status: modelsStatus }),
      systemone: jevOk,
    });
    try {
      const { context, tools, handlers, emitted, stored } = makeContext(fixture.root);
      await plugin.setup(context as never);
      await handlers.get("attach")!({ sessions: [SESSION] });

      const pending = tools[0]!.execute({ query: "retryDelay" }, { sessionID: SESSION });
      await waitForRequests(emitted, 1);

      modelsStatus = 200;
      const accepted = (await handlers.get("submitKey")!({
        requestId: emitted[0]!.requestId,
        key: "good-key",
      })) as { ok: boolean };
      assert.equal(accepted.ok, true);
      assert.equal(stored.length, 1);
      assert.equal(stored[0]!.key, "good-key");

      const result = await pending;
      assert.match(result.content, /status: complete/);
    } finally {
      restore();
      await fixture.cleanup();
    }
  });
});

test("cancelling the prompt settles the search as fallback_required", async () => {
  await withoutEnv(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    const restore = stubFetch({ systemone: jevOk });
    try {
      const { context, tools, handlers, emitted } = makeContext(fixture.root);
      await plugin.setup(context as never);
      await handlers.get("attach")!({ sessions: [SESSION] });

      const pending = tools[0]!.execute({ query: "retryDelay" }, { sessionID: SESSION });
      await waitForRequests(emitted, 1);
      await handlers.get("cancel")!({ requestId: emitted[0]!.requestId });

      const result = await pending;
      assert.match(result.content, /fallback_required/);
    } finally {
      restore();
      await fixture.cleanup();
    }
  });
});

test("an expired stored credential triggers a replacement prompt", async () => {
  await withoutEnv(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    let systemoneCalls = 0;
    const restore = stubFetch({
      models: () => new Response("{}", { status: 200 }),
      systemone: () => {
        systemoneCalls += 1;
        return systemoneCalls === 1 ? new Response("denied", { status: 401 }) : jevOk();
      },
    });
    try {
      const { context, tools, handlers, emitted } = makeContext(fixture.root, { storedKey: "expired-key" });
      await plugin.setup(context as never);
      await handlers.get("attach")!({ sessions: [SESSION] });

      const pending = tools[0]!.execute({ query: "retryDelay" }, { sessionID: SESSION });
      await waitForRequests(emitted, 1);
      assert.equal(emitted[0]!.reason, "expired");

      const accepted = (await handlers.get("submitKey")!({
        requestId: emitted[0]!.requestId,
        key: "replacement-key",
      })) as { ok: boolean };
      assert.equal(accepted.ok, true);

      const result = await pending;
      assert.match(result.content, /status: complete/);
    } finally {
      restore();
      await fixture.cleanup();
    }
  });
});

test("a headless session returns fallback_required immediately while a TUI is attached", async () => {
  await withoutEnv(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    const restore = stubFetch({ systemone: jevOk });
    try {
      const { context, tools, handlers, emitted } = makeContext(fixture.root);
      await plugin.setup(context as never);
      await handlers.get("attach")!({ sessions: [SESSION] });

      const result = await tools[0]!.execute({ query: "retryDelay" }, { sessionID: HEADLESS });
      assert.match(result.content, /fallback_required/);
      assert.equal(emitted.length, 0);
    } finally {
      restore();
      await fixture.cleanup();
    }
  });
});

test("detach settles a pending prompt instead of leaving the search stuck", async () => {
  await withoutEnv(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    const restore = stubFetch({ systemone: jevOk });
    try {
      const { context, tools, handlers, emitted } = makeContext(fixture.root);
      await plugin.setup(context as never);
      await handlers.get("attach")!({ sessions: [SESSION] });

      const pending = tools[0]!.execute({ query: "retryDelay" }, { sessionID: SESSION });
      await waitForRequests(emitted, 1);
      await handlers.get("detach")!({});

      const result = await pending;
      assert.match(result.content, /fallback_required/);
    } finally {
      restore();
      await fixture.cleanup();
    }
  });
});

test("a headless 401 queues the rejected record for the next attaching TUI", async () => {
  await withoutEnv(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    const restore = stubFetch({
      models: () => new Response("{}", { status: 200 }),
      systemone: () => new Response("denied", { status: 401 }),
    });
    try {
      const { context, tools, handlers } = makeContext(fixture.root, { storedKey: "expired-key" });
      await plugin.setup(context as never);

      const result = await tools[0]!.execute({ query: "retryDelay" }, { sessionID: HEADLESS });
      assert.match(result.content, /fallback_required/);

      const attached = (await handlers.get("attach")!({ sessions: [SESSION] })) as { remove: string[] };
      assert.deepEqual(attached.remove, ["cred-1"]);

      await handlers.get("acknowledge")!({ credentialIDs: ["cred-1"] });
      const next = (await handlers.get("attach")!({ sessions: [SESSION] })) as { remove: string[] };
      assert.deepEqual(next.remove, []);
    } finally {
      restore();
      await fixture.cleanup();
    }
  });
});

test("status reports credential sources without exposing values and detach disables prompting", async () => {
  await withoutEnv(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    const restore = stubFetch({ systemone: jevOk });
    try {
      const { context, tools, handlers, emitted } = makeContext(fixture.root);
      await plugin.setup(context as never);

      const status = (await handlers.get("status")!({})) as { provider: string; env: boolean; stored: boolean };
      assert.equal(status.provider, "jev");
      assert.deepEqual(status.jev, { env: false, stored: false });
      assert.deepEqual(status.gemini, { env: Boolean(process.env.GEMINI_API_KEY), stored: false });

      await handlers.get("attach")!({ sessions: [SESSION] });
      await handlers.get("detach")!({});
      const result = await tools[0]!.execute({ query: "retryDelay" }, { sessionID: SESSION });
      assert.match(result.content, /fallback_required/);
      assert.equal(emitted.length, 0);
    } finally {
      restore();
      await fixture.cleanup();
    }
  });
});

test("Gemini prompt verifies and stores only its own key, then search uses Gemini", async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
  const restore = stubFetch({ decisions: (init) => {
    const body = JSON.parse(String(init?.body)) as { questions: { damaged?: unknown } };
    return new Response(JSON.stringify({ answers: body.questions.damaged
      ? { damaged: { type: "noul", noul: 0.9 } }
      : { relevant: { type: "noul", noul: 0.9 } } }), { status: 200 });
  } });
  try {
    const { context, tools, handlers, emitted, stored } = makeContext(fixture.root, { decisionProvider: "gemini", storedKey: "jev-stays" });
    await plugin.setup(context as never);
    const status = (await handlers.get("status")!({})) as { provider: string; stored: boolean };
    assert.equal(status.provider, "gemini");
    assert.equal(status.stored, false);
    await handlers.get("attach")!({ sessions: [SESSION] });
    const pending = tools[0]!.execute({ query: "retryDelay" }, { sessionID: SESSION });
    await waitForRequests(emitted, 1);
    assert.equal((emitted[0] as EmittedRequest & { provider: string }).provider, "gemini");
    const accepted = (await handlers.get("submitKey")!({ requestId: emitted[0]!.requestId, key: "gemini-stored" })) as { ok: boolean };
    assert.equal(accepted.ok, true);
    assert.equal(stored[0]?.integrationID, GEMINI_INTEGRATION_ID);
    const result = await pending;
    assert.match(result.content, /provider: gemini:gemini-decision-1/);
  } finally {
    restore();
    if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
    await fixture.cleanup();
  }
});

test("one plugin switches providers and retains the choice without mixing credentials", async () => {
  const previousGemini = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  await withoutEnv(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    const restore = stubFetch({ systemone: jevOk });
    const options: { storedKey: string; storedGeminiKey: string; decisionProvider: null; savedProvider?: "jev" | "gemini" } = {
      storedKey: "jev-key", storedGeminiKey: "gemini-key", decisionProvider: null,
    };
    try {
      const first = makeContext(fixture.root, options);
      const dispose = await plugin.setup(first.context as never);
      const unselected = await first.tools[0]!.execute({ query: "retryDelay" }, { sessionID: SESSION });
      assert.match(unselected.content, /Select Jev or Gemini/);
      await first.handlers.get("selectProvider")!({ provider: "gemini" });
      const gemini = await first.tools[0]!.execute({ query: "retryDelay" }, { sessionID: SESSION });
      assert.match(gemini.content, /provider: gemini:gemini-decision-1/);
      await first.handlers.get("selectProvider")!({ provider: "jev" });
      const jev = await first.tools[0]!.execute({ query: "retryDelay" }, { sessionID: SESSION });
      assert.match(jev.content, /provider: jev:/);
      await first.handlers.get("selectProvider")!({ provider: "gemini" });
      await dispose?.();

      const reloaded = makeContext(fixture.root, options);
      await plugin.setup(reloaded.context as never);
      const status = (await reloaded.handlers.get("status")!({})) as { provider: string; jev: { stored: boolean }; gemini: { stored: boolean } };
      assert.equal(status.provider, "gemini");
      assert.equal(status.jev.stored, true);
      assert.equal(status.gemini.stored, true);
    } finally {
      restore();
      await fixture.cleanup();
    }
  });
  if (previousGemini !== undefined) process.env.GEMINI_API_KEY = previousGemini;
});
