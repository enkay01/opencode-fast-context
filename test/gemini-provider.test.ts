import assert from "node:assert/strict";
import { test } from "node:test";
import { createGeminiProvider } from "../src/providers/gemini.ts";
import { searchRepository } from "../src/engine/search.ts";
import { makeFixture } from "./fixture.ts";

const candidate = { id: "c1", path: "src/a.ts", code: "export const retryDelay = 1" };
const deadline = () => Date.now() + 5000;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("Gemini scores approved snippets using its documented REST fields and totals usage", async () => {
  const bodies: Record<string, unknown>[] = [];
  const provider = createGeminiProvider({
    apiKey: "test-gemini-key",
    fetchImpl: (async (url, init) => {
      assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/decisions");
      assert.equal((init?.headers as Record<string, string>)["x-goog-api-key"], "test-gemini-key");
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return response({ answers: { relevant: { type: "noul", noul: 0.84, confidence: 0.84 } }, usage: { total_input_tokens: 12, total_output_tokens: 0 } });
    }) as typeof fetch,
  });
  const result = await provider.score("retry", [candidate, { ...candidate, id: "c2" }], { deadline: deadline(), concurrency: 2 });
  assert.deepEqual(result.scores, { c1: 0.84, c2: 0.84 });
  assert.deepEqual(result.usage, { input: 24, output: 0 });
  assert.equal(bodies[0]?.model, "gemini-decision-1");
  const { relevant } = bodies[0]?.questions as { relevant: { type: string; criteria: Record<string, string> } };
  assert.equal(relevant.type, "noul");
  assert.deepEqual(Object.keys(relevant.criteria).sort(), ["false_description", "true_description"]);
  assert.deepEqual(JSON.parse(String(bodies[0]?.input)), {
    question: "retry",
    candidate: { path: candidate.path, code: candidate.code },
  });
});

test("Gemini rejects malformed and nonfinite scores, and preserves partial success", async () => {
  let calls = 0;
  const provider = createGeminiProvider({
    apiKey: "test",
    fetchImpl: (async () => {
      calls++;
      if (calls === 1) return response({ answers: { relevant: { type: "noul", noul: 0.7 } } });
      if (calls === 2) return response({ answers: { relevant: { type: "noul", noul: "0.7" } } });
      return new Response('{"answers":{"relevant":{"type":"noul","noul":1e309}}}');
    }) as typeof fetch,
  });
  const result = await provider.score("retry", [candidate, { ...candidate, id: "c2" }], { deadline: deadline(), concurrency: 1 });
  assert.deepEqual(result.scores, { c1: 0.7 });
  assert.equal(result.skipped, 1);
  await assert.rejects(provider.score("retry", [candidate], { deadline: deadline(), concurrency: 1 }), /invalid relevance score/);
});

test("Gemini surfaces an auth rejection even after another candidate scores", async () => {
  let calls = 0;
  const provider = createGeminiProvider({ apiKey: "test", fetchImpl: (async () => {
    calls++;
    return calls === 1
      ? response({ answers: { relevant: { type: "noul", noul: 0.8 } } })
      : response({ error: { message: "secret response" } }, 403);
  }) as typeof fetch });
  await assert.rejects(
    provider.score("retry", [candidate, { ...candidate, id: "c2" }], { deadline: deadline(), concurrency: 1 }),
    (error: { status?: number; message?: string }) => error.status === 403 && error.message === "HTTP 403",
  );
});

test("Gemini maps directory choices to supplied paths even when labels are long", async () => {
  const longPath = "src/" + "nested/".repeat(40);
  const provider = createGeminiProvider({ apiKey: "test", fetchImpl: (async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { questions: { directory: { criteria: Record<string, string> } } };
    assert.deepEqual(Object.keys(body.questions.directory.criteria), ["option_0", "option_1"]);
    return response({ answers: { directory: { type: "choice", choice: "option_1", probabilities: { option_0: 0.2, option_1: 0.8 } } } });
  }) as typeof fetch });
  const result = await provider.choose!("retry", [{ id: "a", label: "src" }, { id: longPath, label: "deep path" }], { deadline: deadline() });
  assert.equal(result.choice, longPath);
  assert.equal(result.probabilities[longPath], 0.8);
});

test("Gemini discards unknown directory IDs", async () => {
  const provider = createGeminiProvider({ apiKey: "test", fetchImpl: (async () =>
    response({ answers: { directory: { type: "choice", choice: "unknown", probabilities: { option_0: 0.3, unknown: 0.7 } } } })) as typeof fetch });
  const result = await provider.choose!("retry", [{ id: "src", label: "src" }, { id: "docs", label: "docs" }], { deadline: deadline() });
  assert.equal(result.choice, null);
  assert.deepEqual(result.probabilities, { src: 0.3 });
});

test("directory choice remains opt-in in the search engine", async () => {
  const fixture = await makeFixture({ "src/retry.ts": "retry delay", "docs/retry.md": "retry delay" });
  const previous = process.env.FAST_CONTEXT_DIRECTORY_HINT;
  let choices = 0;
  const provider = createGeminiProvider({ apiKey: "test", fetchImpl: (async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { questions: Record<string, unknown> };
    if (body.questions.directory) {
      choices++;
      return response({ answers: { directory: { type: "choice", choice: "option_0", probabilities: { option_0: 0.8, option_1: 0.2 } } } });
    }
    return response({ answers: { relevant: { type: "noul", noul: 0.9 } } });
  }) as typeof fetch });
  try {
    delete process.env.FAST_CONTEXT_DIRECTORY_HINT;
    await searchRepository({ root: fixture.root, query: "retry delay", provider });
    assert.equal(choices, 0);
    process.env.FAST_CONTEXT_DIRECTORY_HINT = "1";
    await searchRepository({ root: fixture.root, query: "retry delay", provider });
    assert.equal(choices, 1);
  } finally {
    if (previous === undefined) delete process.env.FAST_CONTEXT_DIRECTORY_HINT;
    else process.env.FAST_CONTEXT_DIRECTORY_HINT = previous;
    await fixture.cleanup();
  }
});

test("Gemini abstention remains disabled pending model-specific calibration", async () => {
  const fixture = await makeFixture({ "src/retry.ts": "export const retryDelay = 1" });
  const provider = createGeminiProvider({ apiKey: "test", fetchImpl: (async () =>
    response({ answers: { relevant: { type: "noul", noul: 0.02 } } })) as typeof fetch });
  try {
    const result = await searchRepository({ root: fixture.root, query: "retryDelay", provider, includeDiagnostics: true });
    assert.equal(result.status, "complete");
    assert.equal(result.provider.id, "gemini");
    assert.equal(result.diagnostics?.abstainThreshold, null);
    assert.equal(result.results[0]?.scores.decision, 0.02);
  } finally {
    await fixture.cleanup();
  }
});

test("multi-question layout maps scores by candidate position in one request", async () => {
  let calls = 0;
  const provider = createGeminiProvider({ apiKey: "test", layout: "multi-question", fetchImpl: (async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body)) as { input: string; questions: Record<string, unknown> };
    assert.deepEqual(Object.keys(body.questions), ["candidate_0", "candidate_1"]);
    assert.match(body.input, /retryDelay/);
    return response({ answers: {
      candidate_0: { type: "noul", noul: 0.7 }, candidate_1: { type: "noul", noul: 0.2 },
    }, usage: { total_input_tokens: 100, total_output_tokens: 0 } });
  }) as typeof fetch });
  const result = await provider.score("retry", [candidate, { ...candidate, id: "c2" }], { deadline: deadline(), concurrency: 8 });
  assert.equal(calls, 1);
  assert.deepEqual(result.scores, { c1: 0.7, c2: 0.2 });
  assert.deepEqual(result.usage, { input: 100, output: 0 });
});

test("Gemini returns a safe error on provider rejection, cancellation, and deadline", async () => {
  let calls = 0;
  const provider = createGeminiProvider({ apiKey: "test", fetchImpl: async () => {
    calls++;
    return response({ error: { message: "private source" } }, 429);
  } });
  await assert.rejects(provider.score("retry", [candidate], { deadline: deadline(), concurrency: 1 }), { message: "HTTP 429" });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(provider.score("retry", [candidate], { deadline: deadline(), concurrency: 1, signal: controller.signal }), /no candidates scored|cancelled/);
  await assert.rejects(provider.score("retry", [candidate], { deadline: Date.now() - 1, concurrency: 1 }), /no candidates scored|deadline/);
  assert.equal(calls, 1);
});
