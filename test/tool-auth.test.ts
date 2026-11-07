import assert from "node:assert/strict";
import { test } from "node:test";
import type { CredentialBroker } from "../src/tool.ts";
import { runFastContext } from "../src/tool.ts";
import { makeFixture } from "./fixture.ts";

const ENV_KEY = "env-test-key";

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

function jevUnauthorized() {
  return new Response("denied", { status: 401 });
}

function withEnvKey<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  return fn().finally(() => {
    if (previous !== undefined) process.env.TYPESAFE_API_KEY = previous;
  });
}

test("a missing credential prompts once, then the saved key drives the search", async () => {
  await withEnvKey(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    try {
      let stored: string | undefined;
      const reasons: string[] = [];
      const broker: CredentialBroker = {
        resolveStored: async () => stored,
        requestAuth: async (reason) => {
          reasons.push(reason);
          stored = "saved-key";
          return "saved";
        },
      };
      const result = await runFastContext({
        root: fixture.root,
        query: "retryDelay",
        credentials: broker,
        overrides: { fetchImpl: (async () => jevOk()) as typeof fetch },
      });
      assert.equal(result.status, "complete");
      assert.deepEqual(reasons, ["missing"]);
    } finally {
      await fixture.cleanup();
    }
  });
});

test("dismissing the prompt returns fallback_required with onboarding guidance", async () => {
  await withEnvKey(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    try {
      const broker: CredentialBroker = {
        resolveStored: async () => undefined,
        requestAuth: async () => "cancelled",
      };
      const result = await runFastContext({
        root: fixture.root,
        query: "retryDelay",
        credentials: broker,
        overrides: { fetchImpl: (async () => jevOk()) as typeof fetch },
      });
      assert.equal(result.status, "fallback_required");
      assert.match(result.reason ?? "", /\/fast-context auth|TYPESAFE_API_KEY/);
    } finally {
      await fixture.cleanup();
    }
  });
});

test("headless runs without a prompt bridge return fallback_required immediately", async () => {
  await withEnvKey(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    try {
      const broker: CredentialBroker = { resolveStored: async () => undefined };
      const result = await runFastContext({
        root: fixture.root,
        query: "retryDelay",
        credentials: broker,
        overrides: { fetchImpl: (async () => jevOk()) as typeof fetch },
      });
      assert.equal(result.status, "fallback_required");
      assert.equal(result.results.length, 0);
    } finally {
      await fixture.cleanup();
    }
  });
});

test("an expired stored key prompts for replacement and retries once", async () => {
  await withEnvKey(async () => {
    const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
    try {
      let stored: string | undefined = "expired-key";
      const reasons: string[] = [];
      let calls = 0;
      let discards = 0;
      const broker: CredentialBroker = {
        resolveStored: async () => stored,
        requestAuth: async (reason) => {
          reasons.push(reason);
          stored = "replacement-key";
          return "saved";
        },
        discardStored: async () => {
          discards += 1;
        },
      };
      const result = await runFastContext({
        root: fixture.root,
        query: "retryDelay",
        credentials: broker,
        overrides: {
          fetchImpl: (async () => {
            calls += 1;
            return calls === 1 ? jevUnauthorized() : jevOk();
          }) as typeof fetch,
        },
      });
      assert.equal(result.status, "complete");
      assert.deepEqual(reasons, ["expired"]);
      assert.equal(discards, 1);
    } finally {
      await fixture.cleanup();
    }
  });
});

test("a rejected environment key reports the env source and never prompts or reads the store", async () => {
  const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
  const previous = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = ENV_KEY;
  try {
    let storeReads = 0;
    let prompts = 0;
    let discards = 0;
    const broker: CredentialBroker = {
      resolveStored: async () => {
        storeReads += 1;
        return "stored-key";
      },
      requestAuth: async () => {
        prompts += 1;
        return "saved";
      },
      discardStored: async () => {
        discards += 1;
      },
    };
    const result = await runFastContext({
      root: fixture.root,
      query: "retryDelay",
      credentials: broker,
      overrides: { fetchImpl: (async () => jevUnauthorized()) as typeof fetch },
    });
    assert.equal(result.status, "fallback_required");
    assert.match(result.reason ?? "", /TYPESAFE_API_KEY/);
    assert.match(result.reason ?? "", /stored OpenCode credential was left untouched/);
    assert.equal(storeReads, 0);
    assert.equal(prompts, 0);
    assert.equal(discards, 0);
  } finally {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
    await fixture.cleanup();
  }
});
