import assert from "node:assert/strict";
import { test } from "node:test";
import type { CredentialBroker } from "../src/tool.ts";
import { runFastContext } from "../src/tool.ts";
import { makeFixture } from "./fixture.ts";

const ENV_KEY = "env-test-key";

test("a rejected environment key reports the env source and never prompts or reads the store", async () => {
  const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
  const previous = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = ENV_KEY;
  try {
    let storeReads = 0;
    let prompts = 0;
    let discards = 0;
    const sentKeys: Array<string | null> = [];
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
      overrides: {
        fetchImpl: async (_url, init) => {
          sentKeys.push(new Headers(init?.headers).get("authorization"));
          return new Response("denied", { status: 401 });
        },
      },
    });
    assert.equal(result.status, "fallback_required");
    assert.match(result.reason ?? "", /TYPESAFE_API_KEY/);
    assert.match(result.reason ?? "", /stored OpenCode credential was left untouched/);
    assert.equal(storeReads, 0);
    assert.equal(prompts, 0);
    assert.equal(discards, 0);
    assert.deepEqual(sentKeys, [`Bearer ${ENV_KEY}`]);
  } finally {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
    await fixture.cleanup();
  }
});
