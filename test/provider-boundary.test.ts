import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveProvider } from "../src/config.ts";
import { formatForModel, runFastContext } from "../src/tool.ts";
import { searchRepository } from "../src/engine/search.ts";
import type { DecisionProvider } from "../src/providers/types.ts";
import { makeFixture } from "./fixture.ts";

const SECRET = "sk_live_abcdefghijklmnop";

test("missing TYPESAFE_API_KEY is a configuration failure, not a local fallback", async () => {
  const resolution = resolveProvider({});
  assert.equal(resolution.provider, null);
  assert.match(resolution.error ?? "", /TYPESAFE_API_KEY/);

  const fixture = await makeFixture({ "src/a.ts": "export const retryDelay = 1\n" });
  const previous = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    const result = await runFastContext({ root: fixture.root, query: "retryDelay" });
    assert.equal(result.status, "fallback_required");
    assert.equal(result.results.length, 0);
    assert.match(result.reason ?? "", /TYPESAFE_API_KEY/);
  } finally {
    if (previous !== undefined) process.env.TYPESAFE_API_KEY = previous;
    await fixture.cleanup();
  }
});

test("credential-like source and sensitive files never reach the provider", async () => {
  const fixture = await makeFixture({
    "src/leak.ts": `export const API_KEY = "${SECRET}"\nexport function retryDelay() { return 1 }\n`,
    "src/plain.ts": "export function retryDelayPlain() { return 2 }\n",
    ".pypirc": `[pypi]\npassword = ${SECRET}\n`,
  });

  const seen: string[] = [];
  const provider: DecisionProvider = {
    id: "jev",
    model: "stub",
    async score(_query, candidates) {
      for (const candidate of candidates) seen.push(candidate.code);
      return {
        scores: Object.fromEntries(candidates.map((candidate) => [candidate.id, 0.9])),
        usage: null,
        model: "stub",
        skipped: 0,
      };
    },
  };

  try {
    const result = await searchRepository({
      root: fixture.root,
      query: "API_KEY",
      provider,
      includeDiagnostics: true,
    });
    assert.ok(seen.length > 0);
    assert.ok(seen.every((code) => !code.includes(SECRET)), "secret leaked to provider");
    assert.ok(!result.results.some((evidence) => evidence.path === ".pypirc"));
    assert.ok((result.diagnostics?.redactedCandidates ?? 0) >= 1);
  } finally {
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
    assert.ok(!JSON.stringify(result).includes(GITHUB_MARKER));
    assert.ok(!formatForModel(result).includes(GITHUB_MARKER));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
    await fixture.cleanup();
  }
});

test("a missing credential is not described as local ranking", async () => {
  const fixture = await makeFixture({ "src/a.ts": "export const a = 1\n" });
  const previous = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    const result = await runFastContext({ root: fixture.root, query: "a" });
    const text = formatForModel(result);
    assert.match(text, /^provider: not configured$/m);
    assert.ok(!/provider: local ranking/.test(text));
  } finally {
    if (previous !== undefined) process.env.TYPESAFE_API_KEY = previous;
    await fixture.cleanup();
  }
});
