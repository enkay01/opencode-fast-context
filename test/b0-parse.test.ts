import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { parseAnswer, toResult, validateCitations } from "../bench/b0-parse.ts";
import { makeFixture } from "./fixture.ts";

test("only an exact NO_ANSWER counts as a no-answer response", () => {
  assert.equal(parseAnswer("NO_ANSWER").noAnswer, true);
  assert.equal(parseAnswer("  no_answer  \n").noAnswer, true);
  assert.equal(parseAnswer("NO_ANSWER\nbecause none exists").noAnswer, false);
  assert.equal(parseAnswer("I could not find it.").noAnswer, false);
});

test("rejects citations outside the file and outside the worktree", async () => {
  const fixture = await makeFixture({
    "src/a.ts": "one\ntwo\nthree\n",
  });
  try {
    const { valid, invalid } = await validateCitations(fixture.root, [
      { path: "src/a.ts", start: 1, end: 2 },
      { path: "src/a.ts", start: 999, end: 1000 },
      { path: "../escape.ts", start: 1, end: 1 },
      { path: "missing.ts", start: 1, end: 1 },
    ]);
    assert.equal(valid.length, 1);
    assert.equal(invalid, 3);
    assert.deepEqual(valid[0]?.ranges, [{ start: 1, end: 2 }]);
  } finally {
    await fixture.cleanup();
  }
});

test("a malformed B0 answer is not treated as a successful no-answer", async () => {
  const fixture = await makeFixture({ "src/a.ts": "one\ntwo\n" });
  try {
    const parsed = await toResult("Where is it?", "I looked around but did not find it.", fixture.root, "fixture");
    assert.equal(parsed.malformed, true);
    assert.equal(parsed.noAnswer, false);
    assert.equal(parsed.result.status, "fallback_required");
  } finally {
    await fixture.cleanup();
  }
});

test("invalid B0 citations are dropped and counted", async () => {
  const fixture = await makeFixture({ "src/a.ts": "one\ntwo\n" });
  try {
    const parsed = await toResult(
      "Where is it?",
      "src/a.ts:1-2\nsrc/a.ts:99-120\n",
      fixture.root,
      "fixture",
    );
    assert.equal(parsed.result.results.length, 1);
    assert.equal(parsed.invalidCitations, 1);
    assert.equal(parsed.result.status, "complete");
  } finally {
    await fixture.cleanup();
  }
});
