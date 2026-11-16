import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveProviderAsync } from "../src/config.ts";
import { runFastContext, type CredentialBroker } from "../src/tool.ts";
import { makeFixture } from "./fixture.ts";

const good = () => new Response(JSON.stringify({ answers: { relevant: { type: "noul", noul: 0.8 } }, usage: { total_input_tokens: 10, total_output_tokens: 0 } }), { status: 200 });

test("Gemini uses its environment key without consulting the stored or TypeSafe key", async () => {
  let storedReads = 0;
  let header = "";
  const resolution = await resolveProviderAsync({ GEMINI_API_KEY: "gemini-env", TYPESAFE_API_KEY: "typesafe-env" }, {
    fetchImpl: (async (_url, init) => {
      header = (init?.headers as Record<string, string>)["x-goog-api-key"];
      return good();
    }) as typeof fetch,
  }, async () => { storedReads++; return "gemini-stored"; }, "gemini");
  assert.ok(resolution.provider);
  await resolution.provider.score("retry", [{ id: "x", path: "src/a.ts", code: "retry" }], { deadline: Date.now() + 5000, concurrency: 1 });
  assert.equal(header, "gemini-env");
  assert.equal(storedReads, 0);
});

test("Gemini stored key handles rejected credentials without touching an environment key", async () => {
  const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
  const oldGemini = process.env.GEMINI_API_KEY;
  const oldTypeSafe = process.env.TYPESAFE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  process.env.TYPESAFE_API_KEY = "untouched-typesafe";
  let storedKey = "bad-gemini";
  let discarded = 0;
  const broker: CredentialBroker = {
    resolveStored: async () => storedKey,
    discardStored: async () => { discarded++; },
    requestAuth: async () => { storedKey = "replacement-gemini"; return "saved"; },
  };
  try {
    const result = await runFastContext({ root: fixture.root, query: "retryDelay", config: { decisionProvider: "gemini" }, credentials: broker,
      overrides: { fetchImpl: (async (_url, init) =>
        (init?.headers as Record<string, string>)["x-goog-api-key"] === "bad-gemini" ? new Response("", { status: 401 }) : good()) as typeof fetch },
    });
    assert.equal(result.status, "complete");
    assert.equal(result.provider.id, "gemini");
    assert.equal(discarded, 1);
    assert.equal(process.env.TYPESAFE_API_KEY, "untouched-typesafe");
  } finally {
    if (oldGemini !== undefined) process.env.GEMINI_API_KEY = oldGemini;
    if (oldTypeSafe === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = oldTypeSafe;
    await fixture.cleanup();
  }
});

test("a missing Gemini key returns provider-specific headless guidance", async () => {
  const fixture = await makeFixture({ "src/a.ts": "retry" });
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await runFastContext({ root: fixture.root, query: "retry", config: { decisionProvider: "gemini" }, credentials: { resolveStored: async () => undefined } });
    assert.equal(result.status, "fallback_required");
    assert.match(result.reason ?? "", /GEMINI_API_KEY/);
  } finally {
    if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
    await fixture.cleanup();
  }
});

test("a rejected Gemini environment key does not discard a stored key or use TypeSafe", async () => {
  const fixture = await makeFixture({ "src/a.ts": "retry" });
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "rejected-gemini-env";
  let storedReads = 0;
  let discarded = 0;
  try {
    const result = await runFastContext({ root: fixture.root, query: "retry", config: { decisionProvider: "gemini" },
      credentials: { resolveStored: async () => { storedReads++; return "saved-gemini"; }, discardStored: async () => { discarded++; } },
      overrides: { fetchImpl: (async () => new Response("", { status: 403 })) as typeof fetch },
    });
    assert.equal(result.status, "fallback_required");
    assert.match(result.reason ?? "", /GEMINI_API_KEY.*403/);
    assert.equal(storedReads, 0);
    assert.equal(discarded, 0);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
    await fixture.cleanup();
  }
});
