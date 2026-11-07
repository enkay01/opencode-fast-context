import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FAST_CONTEXT_INTEGRATION_ID,
  fastContextCredentialEntries,
  hasStoredCredential,
  registerFastContextIntegration,
  removeAllFastContextCredentials,
  removeFastContextCredentials,
  removeStaleFastContextCredentials,
  replacementRemoval,
  resolveStoredApiKey,
  storeApiKey,
  verificationErrorMessage,
  verifyApiKey,
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

test("storeApiKey persists through connect.key and hasStoredCredential reflects state", async () => {
  const { api, stored } = makeIntegration();
  assert.equal(await hasStoredCredential(api), false);
  await storeApiKey(api, "new-key");
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.integrationID, FAST_CONTEXT_INTEGRATION_ID);
  assert.equal(stored[0]?.key, "new-key");
});

const okResponse = () =>
  new Response(JSON.stringify({ models: [] }), { status: 200, headers: { "content-type": "application/json" } });

test("verifyApiKey accepts a working key", async () => {
  const result = await verifyApiKey("good-key", {
    fetchImpl: (async () => okResponse()) as typeof fetch,
  });
  assert.equal(result, "valid");
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
  const result = await verifyApiKey("key", {
    timeoutMs: 5,
    fetchImpl: ((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      })) as typeof fetch,
  });
  assert.equal(result, "unverified");
});

test("verification errors never echo the submitted key", () => {
  const message = verificationErrorMessage("invalid");
  assert.ok(!message.includes("bad-key"));
  assert.match(message, /401\/403|rejected/i);
});

const entry = (id: string, integrationID: string, active = false) => ({ id, integrationID, active });

test("fastContextCredentialEntries selects only fast-context records", () => {
  const entries = [
    entry("a", FAST_CONTEXT_INTEGRATION_ID),
    entry("b", "exa"),
    entry("c", FAST_CONTEXT_INTEGRATION_ID, true),
  ];
  assert.deepEqual(
    fastContextCredentialEntries(entries).map((item) => item.id),
    ["a", "c"],
  );
});

test("replacementRemoval keeps the active record and drops duplicates", () => {
  const entries = [
    entry("old-1", FAST_CONTEXT_INTEGRATION_ID),
    entry("old-2", FAST_CONTEXT_INTEGRATION_ID),
    entry("other", "exa"),
    entry("active", FAST_CONTEXT_INTEGRATION_ID, true),
  ];
  assert.deepEqual(
    replacementRemoval(entries).map((item) => item.id).sort(),
    ["old-1", "old-2"],
  );
});

test("replacementRemoval falls back to the first record when none is active", () => {
  const entries = [entry("first", FAST_CONTEXT_INTEGRATION_ID), entry("second", FAST_CONTEXT_INTEGRATION_ID)];
  assert.deepEqual(
    replacementRemoval(entries).map((item) => item.id),
    ["second"],
  );
});

function recordList(initial: CredentialEntryLike[]) {
  const entries = [...initial];
  const removed: string[] = [];
  return {
    entries,
    removed,
    api: {
      list: async () => entries,
      remove: async ({ credentialID }: { credentialID: string }) => {
        removed.push(credentialID);
        const index = entries.findIndex((item) => item.id === credentialID);
        if (index >= 0) entries.splice(index, 1);
      },
    },
  };
}

test("a verified replacement removes every older record and keeps the active one", async () => {
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

test("cancelling a replacement does not remove records", async () => {
  const store = recordList([entry("active", FAST_CONTEXT_INTEGRATION_ID, true)]);
  assert.deepEqual(await removeStaleFastContextCredentials(store.api), []);
  assert.deepEqual(store.removed, []);
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
