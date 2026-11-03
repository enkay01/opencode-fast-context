import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCorpus, validateCorpus } from "../bench/corpus.ts";

test("rejects a checkout whose HEAD differs from the pinned commit", async () => {
  const corpus = await loadCorpus(".");
  const copy = structuredClone(corpus);
  copy.repos.ripgrep = { ...copy.repos.ripgrep!, commit: "0".repeat(40) };
  const errors = await validateCorpus(".", copy);
  assert.ok(errors.some((error) => /does not match pinned/.test(error)), errors.join("; "));
});

test("accepts the pinned corpus and every label range", async () => {
  const corpus = await loadCorpus(".");
  assert.deepEqual(await validateCorpus(".", corpus), []);
});
