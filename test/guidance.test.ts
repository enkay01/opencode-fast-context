import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTO_INVOKE_GUIDANCE, applyAutoInvokeGuidance, normalizeAutoInvoke } from "../src/guidance.ts";

test("autoInvoke defaults to suggest and only off disables", () => {
  assert.equal(normalizeAutoInvoke(undefined), "suggest");
  assert.equal(normalizeAutoInvoke("off"), "off");
  assert.equal(normalizeAutoInvoke("nonsense"), "suggest");
});

test("guidance is one bounded instruction and is idempotent", () => {
  const system: Array<{ type: "text"; text: string }> = [];
  assert.equal(applyAutoInvokeGuidance(system, "suggest"), true);
  assert.equal(applyAutoInvokeGuidance(system, "suggest"), false);
  assert.equal(system.length, 1);
  assert.equal(system[0]?.text, AUTO_INVOKE_GUIDANCE);
  assert.match(AUTO_INVOKE_GUIDANCE, /fast_context_search/);
});

test("off adds nothing", () => {
  const system: Array<{ type: "text"; text: string }> = [];
  assert.equal(applyAutoInvokeGuidance(system, "off"), false);
  assert.equal(system.length, 0);
});
