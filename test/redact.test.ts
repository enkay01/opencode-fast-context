import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeForProvider } from "../src/providers/redact.ts";
import { createJevProvider } from "../src/providers/systemone.ts";

const DUMMY_KEY = "dummy-typesafe-key-0123456789";
const SOURCE_MARKER = "HOSTILE_SOURCE_MARKER";

test("redacts bearer tokens, API keys, and cloud credentials", () => {
  const payload = sanitizeForProvider(
    [
      'const API_KEY = "sk_live_abcdefghijklmnop"',
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
      "aws AKIAIOSFODNN7EXAMPLE",
      "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    ].join("\n"),
  );
  assert.equal(payload.ok, true);
  assert.ok(!payload.text.includes("sk_live_abcdefghijklmnop"));
  assert.ok(!payload.text.includes("abcdefghijklmnopqrstuvwxyz"));
  assert.ok(!payload.text.includes("AKIAIOSFODNN7EXAMPLE"));
  assert.ok(!payload.text.includes("ghp_abcdefghijklmnopqrstuvwxyz0123456789"));
  assert.ok(payload.redactions >= 3);
});

test("rejects private key blocks instead of sending them", () => {
  const payload = sanitizeForProvider(
    "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----",
  );
  assert.equal(payload.ok, false);
  assert.equal(payload.text, "");
});

test("provider errors never expose the response body or credential", async () => {
  const provider = createJevProvider({
    apiKey: DUMMY_KEY,
    fetchImpl: (async () =>
      new Response(`credential ${DUMMY_KEY} source ${SOURCE_MARKER}`, {
        status: 500,
        headers: { "x-request-id": "req_test_123" },
      })) as typeof fetch,
  });

  await assert.rejects(
    () =>
      provider.score("where", [{ id: "c1", path: "a.ts", code: "const a = 1" }], {
        deadline: Date.now() + 5000,
        concurrency: 1,
      }),
    (error: Error) => {
      assert.match(error.message, /HTTP 500/);
      assert.match(error.message, /req_test_123/);
      assert.ok(!error.message.includes(DUMMY_KEY));
      assert.ok(!error.message.includes(SOURCE_MARKER));
      return true;
    },
  );
});

test("successful requests redact credentials from the outgoing payload", async () => {
  let body = "";
  const provider = createJevProvider({
    apiKey: DUMMY_KEY,
    fetchImpl: (async (_url: string, init?: RequestInit) => {
      body = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          model: "jev-test",
          answers: { relevant: { type: "noul", noul: 0.9 } },
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch,
  });

  await provider.score("where", [{ id: "c1", path: "a.ts", code: "const a = 1" }], {
    deadline: Date.now() + 5000,
    concurrency: 1,
  });
  assert.ok(body.includes("a.ts"));
});
