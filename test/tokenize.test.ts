import assert from "node:assert/strict";
import { test } from "node:test";
import { identifiersIn, splitIdentifier, tokenize } from "../src/engine/tokenize.ts";

test("tokenize drops prose filler and keeps identifiers", () => {
  const tokens = tokenize("Where does the app decide whether a user can retry the request?");
  assert.ok(tokens.includes("decide"));
  assert.ok(tokens.includes("retry"));
  assert.ok(!tokens.includes("the"));
  assert.ok(!tokens.includes("where"));
});

test("tokenize keeps camelCase parts and quoted phrases", () => {
  const tokens = tokenize('Find "maxRetryCount" and handleTimeout');
  assert.ok(tokens.includes("maxretrycount"));
  assert.ok(tokens.includes("maxtry") || tokens.includes("retry"));
  assert.ok(tokens.includes("handletimeout"));
  assert.ok(tokens.includes("timeout"));
});

test("splitIdentifier splits snake and camel case", () => {
  assert.deepEqual(splitIdentifier("max_retryCount"), ["max", "retry", "count"]);
});

test("identifiersIn ranks repeated code names and skips noise", () => {
  const ids = identifiersIn(
    "const value = resolveWorkspace(workspaceId); resolveWorkspace(value); return undefined",
  );
  assert.equal(ids[0], "resolveWorkspace");
  assert.ok(ids.includes("workspaceId"));
  assert.ok(!ids.includes("undefined"));
});
