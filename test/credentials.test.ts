import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FAST_CONTEXT_INTEGRATION_ID,
  GEMINI_INTEGRATION_ID,
  registerFastContextIntegration,
  removeAllFastContextCredentials,
  removeFastContextCredentials,
  removeStaleFastContextCredentials,
  resolveStoredApiKey,
  storeApiKey,
  verifyApiKey,
  verifyGeminiApiKey,
  type CredentialEntryLike,
  type IntegrationCredentialApi,
} from "../src/credentials.ts";

function makeIntegration(overrides?: {
  active?: unknown;
  resolved?: unknown;
  stored?: Array<{ integrationID: string; key: string; label?: string }>;
}) {
  const stored = overrides?.stored ?? [];
  const api: IntegrationCredentialApi = {
    transform: async (fn) => {
      const calls: unknown[] = [];
      fn({
        update: (id, apply) => {
          calls.push(["update", id]);
          apply({ id, name: "" });
        },
        method: {
          update: (input) => {
            calls.push(["method", input]);
          },
        },
      });
      (api as { __calls?: unknown[] }).__calls = calls;
      return { dispose: async () => undefined };
    },
    connection: {
      active: async () => overrides?.active,
      resolve: async () => overrides?.resolved,
    },
    connect: {
      key: async (input) => {
        stored.push(input);
        return {};
      },
    },
  };
  return { api, stored };
}

test("registers the fast-context integration with a key method", async () => {
  const { api } = makeIntegration();
  const registration = await registerFastContextIntegration(api);
  const calls = (api as { __calls?: unknown[] }).__calls ?? [];
  assert.deepEqual(calls[0], ["update", FAST_CONTEXT_INTEGRATION_ID]);
  assert.deepEqual(calls[1], [
    "method",
    {
      integrationID: FAST_CONTEXT_INTEGRATION_ID,
      method: { type: "key", label: "TypeSafe API key" },
    },
  ]);
  await registration.dispose();
});

test("Gemini verifies access with a fixed sample decision", async () => {
  const { api, stored } = makeIntegration();
  await registerFastContextIntegration(api, "gemini");
  const calls = (api as { __calls?: unknown[] }).__calls ?? [];
  assert.equal((calls[0] as string[])[1], GEMINI_INTEGRATION_ID);
  let request: { url: string; key: string | null; body: { model: string; input: string } } | undefined;
  const result = await verifyGeminiApiKey("dummy", { fetchImpl: (async (_url, init) => {
    request = {
      url: String(_url),
      key: new Headers(init?.headers).get("x-goog-api-key"),
      body: JSON.parse(String(init?.body)),
    };
    return new Response(JSON.stringify({ answers: { damaged: { type: "noul", noul: 0.9 } } }), { status: 200 });
  }) as typeof fetch });
  assert.equal(result, "valid");
  assert.equal(request?.url, "https://generativelanguage.googleapis.com/v1beta/decisions");
  assert.equal(request?.key, "dummy");
  assert.equal(request?.body.model, "gemini-decision-1");
  assert.equal(request?.body.input, "The package arrived damaged.");
  await storeApiKey(api, "gemini-only", GEMINI_INTEGRATION_ID);
  assert.equal(stored[0]?.integrationID, GEMINI_INTEGRATION_ID);
  assert.equal(await verifyGeminiApiKey("dummy", { fetchImpl: (async () => new Response("", { status: 403 })) as typeof fetch }), "invalid");
});

test("resolveStoredApiKey returns the active key credential", async () => {
  const connection = { type: "key", id: "c1" };
  const { api } = makeIntegration({
    active: connection,
    resolved: { type: "key", key: "stored-key" },
  });
  assert.equal(await resolveStoredApiKey(api), "stored-key");
});

test("resolveStoredApiKey is empty without a connection or a key credential", async () => {
  const noConnection = makeIntegration({ active: undefined });
  assert.equal(await resolveStoredApiKey(noConnection.api), undefined);

  const wrongType = makeIntegration({
    active: { type: "key", id: "c1" },
    resolved: { type: "oauth", key: "stored-key" },
  });
  assert.equal(await resolveStoredApiKey(wrongType.api), undefined);
});

test("verifyApiKey rejects 401 and 403 keys", async () => {
  for (const status of [401, 403]) {
    const result = await verifyApiKey("bad-key", {
      fetchImpl: (async () => new Response("denied", { status })) as typeof fetch,
    });
    assert.equal(result, "invalid");
  }
});

test("verifyApiKey reports unverified on server errors and network failure", async () => {
  const serverError = await verifyApiKey("key", {
    fetchImpl: (async () => new Response("oops", { status: 500 })) as typeof fetch,
  });
  assert.equal(serverError, "unverified");

  const network = await verifyApiKey("key", {
    fetchImpl: (async () => {
      throw new Error("connection refused");
    }) as typeof fetch,
  });
  assert.equal(network, "unverified");
});

test("verifyApiKey reports unverified when the probe times out", async () => {
  let guard: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      verifyApiKey("key", {
        timeoutMs: 5,
        fetchImpl: ((_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          })) as typeof fetch,
      }),
      // AbortSignal.timeout uses an unref'd timer, so the mock's pending
      // promise alone does not keep the test process alive. This ref'd timer
      // both keeps the loop alive and fails fast if the probe never settles.
      new Promise<never>((_resolve, reject) => {
        guard = setTimeout(() => reject(new Error("verifyApiKey did not honor its timeout")), 1000);
      }),
    ]);
    assert.equal(result, "unverified");
  } finally {
    if (guard) clearTimeout(guard);
  }
});

const entry = (id: string, integrationID: string, active = false) => ({ id, integrationID, active });

function recordList(initial: CredentialEntryLike[]) {
  const entries = [...initial];
  return {
    entries,
    api: {
      list: async () => entries,
      remove: async ({ credentialID }: { credentialID: string }) => {
        const index = entries.findIndex((item) => item.id === credentialID);
        if (index >= 0) entries.splice(index, 1);
      },
    },
  };
}

test("credential cleanup removes duplicates and keeps the active record", async () => {
  const store = recordList([
    entry("old-1", FAST_CONTEXT_INTEGRATION_ID),
    entry("old-2", FAST_CONTEXT_INTEGRATION_ID),
    entry("other", "exa"),
    entry("active", FAST_CONTEXT_INTEGRATION_ID, true),
  ]);
  assert.deepEqual(await removeStaleFastContextCredentials(store.api), ["old-1", "old-2"]);
  assert.deepEqual(store.entries.map((item) => item.id).sort(), ["active", "other"]);
});

test("expiry removes every Fast Context record and leaves other integrations", async () => {
  const store = recordList([
    entry("active", FAST_CONTEXT_INTEGRATION_ID, true),
    entry("duplicate", FAST_CONTEXT_INTEGRATION_ID),
    entry("other", "exa"),
  ]);
  assert.deepEqual(await removeAllFastContextCredentials(store.api), ["active", "duplicate"]);
  assert.deepEqual(store.entries.map((item) => item.id), ["other"]);
});

test("credential cleanup keeps the first record when none is active", async () => {
  const store = recordList([entry("first", FAST_CONTEXT_INTEGRATION_ID), entry("second", FAST_CONTEXT_INTEGRATION_ID)]);
  assert.deepEqual(await removeStaleFastContextCredentials(store.api), ["second"]);
  assert.deepEqual(store.entries.map((item) => item.id), ["first"]);
});

test("queued rejected IDs remove only matching Fast Context records", async () => {
  const store = recordList([
    entry("rejected", FAST_CONTEXT_INTEGRATION_ID),
    entry("active", FAST_CONTEXT_INTEGRATION_ID, true),
    entry("other", "exa"),
  ]);
  assert.deepEqual(await removeFastContextCredentials(store.api, ["rejected", "other", "missing"]), ["rejected"]);
  assert.deepEqual(store.entries.map((item) => item.id), ["active", "other"]);
});

test("Gemini replacement and revocation leave TypeSafe records in place", async () => {
  const store = recordList([
    entry("jev", FAST_CONTEXT_INTEGRATION_ID, true),
    entry("gemini-old", GEMINI_INTEGRATION_ID),
    entry("gemini-new", GEMINI_INTEGRATION_ID, true),
  ]);
  assert.deepEqual(await removeStaleFastContextCredentials(store.api, GEMINI_INTEGRATION_ID), ["gemini-old"]);
  assert.deepEqual(await removeAllFastContextCredentials(store.api, GEMINI_INTEGRATION_ID), ["gemini-new"]);
  assert.deepEqual(store.entries.map((item) => item.id), ["jev"]);
});
