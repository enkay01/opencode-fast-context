import assert from "node:assert/strict";
import { test } from "node:test";
import { readPublicConfig, resolveProvider } from "../src/config.ts";
import { formatForModel, runFastContext } from "../src/tool.ts";
import { makeFixture } from "./fixture.ts";

const SECRET = "sk_live_abcdefghijklmnop";

test("an unknown provider is rejected before retrieval", async () => {
  const config = readPublicConfig({ decisionProvider: "unexpected" });
  const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
  try {
    const result = await runFastContext({ root: fixture.root, query: "retryDelay", config });
    assert.equal(result.status, "fallback_required");
    assert.match(result.reason ?? "", /decisionProvider/);
    assert.equal(result.searched.candidates, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("a missing TypeSafe key returns onboarding guidance without local evidence", async () => {
  const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
  const previous = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    const result = await runFastContext({ root: fixture.root, query: "retryDelay" });
    assert.equal(result.status, "fallback_required");
    assert.equal(result.results.length, 0);
    assert.deepEqual(result.searched, { candidates: 0, files: 0, truncated: false });
    assert.match(result.reason ?? "", /TYPESAFE_API_KEY/);
    assert.match(formatForModel(result), /^provider: not configured$/m);
  } finally {
    if (previous !== undefined) process.env.TYPESAFE_API_KEY = previous;
    await fixture.cleanup();
  }
});

test("Jev receives redacted source and excludes matching credential files", async () => {
  const fixture = await makeFixture({
    "src/leak.ts": `export const API_KEY = "${SECRET}"\n`,
    "config/credentials.json": '{"API_KEY":"credential-file-marker"}\n',
  });
  const previous = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "dummy-key";
  const candidates: Array<{ path: string; code: string }> = [];
  try {
    const result = await runFastContext({
      root: fixture.root,
      query: "API_KEY",
      overrides: {
        fetchImpl: async (_url, init) => {
          const { state } = JSON.parse(String(init?.body));
          candidates.push(state.candidate);
          return Response.json({
            model: "jev-test",
            answers: { relevant: { type: "noul", noul: 0.95 } },
          });
        },
      },
    });
    assert.equal(result.status, "complete");
    assert.deepEqual(candidates.map((candidate) => candidate.path), ["src/leak.ts"]);
    assert.match(candidates[0]!.code, /API_KEY.*\[REDACTED/);
    assert.ok(!candidates[0]!.code.includes(SECRET));
    assert.deepEqual(result.results.map((evidence) => evidence.path), ["src/leak.ts"]);
  } finally {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
    await fixture.cleanup();
  }
});

test("the public configuration cannot redirect the bearer token to another endpoint", async () => {
  let called = "";
  const provider = resolveProvider(
    { TYPESAFE_API_KEY: "dummy-key", TYPESAFE_ENDPOINT: "http://attacker.invalid" },
    {
      fetchImpl: (async (url: string) => {
        called = String(url);
        return new Response(
          JSON.stringify({
            model: "jev-test",
            answers: { relevant: { type: "noul", noul: 0.5 } },
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    },
  ).provider;
  assert.ok(provider);
  await provider.score("where", [{ id: "c1", path: "a.ts", code: "const a = 1" }], {
    deadline: Date.now() + 5000,
    concurrency: 1,
  });
  assert.equal(called, "https://api.typesafe.ai/v1/systemone");
});

const GITHUB_MARKER = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";

test("final tool content and metadata redact credential-like evidence", async () => {
  const fixture = await makeFixture({
    "src/leak.ts": `export const API_KEY = "${GITHUB_MARKER}"\nexport function retryDelay() { return 1 }\n`,
  });
  const previousKey = process.env.TYPESAFE_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.TYPESAFE_API_KEY = "dummy-key";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        model: "jev-test",
        answers: { relevant: { type: "noul", noul: 0.95 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
  try {
    const result = await runFastContext({ root: fixture.root, query: "API_KEY" });
    assert.equal(result.status, "complete");
    const serialized = JSON.stringify(result);
    const formatted = formatForModel(result);
    assert.ok(!serialized.includes(GITHUB_MARKER), "metadata leaked the credential");
    assert.ok(!formatted.includes(GITHUB_MARKER), "tool content leaked the credential");
    assert.ok(result.results.some((evidence) => evidence.excerpt.includes("[REDACTED")));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
    await fixture.cleanup();
  }
});

test("fallback evidence also redacts credential-like content", async () => {
  const fixture = await makeFixture({
    "src/leak.ts": `export const API_KEY = "${GITHUB_MARKER}"\nexport function retryDelay() { return 1 }\n`,
  });
  const previousKey = process.env.TYPESAFE_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.TYPESAFE_API_KEY = "dummy-key";
  globalThis.fetch = (async () => new Response("hostile", { status: 503 })) as typeof fetch;
  try {
    const result = await runFastContext({ root: fixture.root, query: "API_KEY" });
    assert.equal(result.status, "fallback_required");
    assert.equal(result.results[0]?.path, "src/leak.ts");
    assert.match(result.results[0]!.excerpt, /\[REDACTED/);
    assert.ok(!JSON.stringify(result).includes(GITHUB_MARKER));
    assert.ok(!formatForModel(result).includes(GITHUB_MARKER));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
    await fixture.cleanup();
  }
});
