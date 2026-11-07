import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMaskDelta, createMaskState, SECRET_MASK } from "../src/mask.ts";

/** Simulates typing `keys` one character at a time into the masked input. */
function type(secret: string) {
  let state = createMaskState();
  for (const char of secret) {
    const buffer = state.shown + char;
    state = applyMaskDelta(state, buffer);
  }
  return state;
}

test("typing collects the secret while the buffer only shows mask characters", () => {
  const state = type("ts_live_abc123");
  assert.equal(state.secret, "ts_live_abc123");
  assert.equal(state.shown, SECRET_MASK.repeat("ts_live_abc123".length));
  assert.ok(!state.shown.includes("t"));
});

test("backspace removes the last secret character", () => {
  let state = type("abcd");
  state = applyMaskDelta(state, "•••");
  assert.equal(state.secret, "abc");
  assert.equal(state.shown, "•••");
});

test("pasted text is collected in one delta", () => {
  const state = applyMaskDelta(createMaskState(), "pasted-key-123");
  assert.equal(state.secret, "pasted-key-123");
});

test("whitespace and control characters never enter the secret", () => {
  const state = applyMaskDelta(createMaskState(), "ab\tc d\ne");
  assert.equal(state.secret, "abcde");
});

test("an unrecognized buffer falls back to stripping mask characters", () => {
  let state = type("ab");
  state = applyMaskDelta(state, "xy");
  assert.equal(state.secret, "xy");
});

test("empty input stays empty", () => {
  const state = applyMaskDelta(createMaskState(), "");
  assert.equal(state.secret, "");
  assert.equal(state.shown, "");
});

test("a character inserted in the middle keeps both sides of the secret", () => {
  const state = applyMaskDelta({ secret: "abcd", shown: "••••", cursor: 0 }, "••x••");
  assert.equal(state.secret, "abxcd");
  assert.equal(state.shown, SECRET_MASK.repeat(5));
  assert.equal(state.cursor, 3);
});

test("a character deleted in the middle removes only that character", () => {
  const state = applyMaskDelta({ secret: "abcd", shown: "••••", cursor: 0 }, "•••", 1);
  assert.equal(state.secret, "acd");
  assert.equal(state.cursor, 1);
});

test("a trailing deletion removes the last character", () => {
  const state = applyMaskDelta({ secret: "abcd", shown: "••••", cursor: 0 }, "•••", 3);
  assert.equal(state.secret, "abc");
  assert.equal(state.cursor, 3);
});

test("a selection replaced in the middle keeps the surrounding secret", () => {
  const state = applyMaskDelta({ secret: "abcd", shown: "••••", cursor: 0 }, "•x•");
  assert.equal(state.secret, "axd");
  assert.equal(state.cursor, 2);
});

test("text pasted at the caret is inserted at that position", () => {
  const state = applyMaskDelta({ secret: "abcd", shown: "••••", cursor: 0 }, "key••••");
  assert.equal(state.secret, "keyabcd");
  assert.equal(state.cursor, 3);
});

test("the caret lands after the inserted text and never inside a mask run", () => {
  let state = type("abcd");
  state = applyMaskDelta(state, "••x••");
  assert.equal(state.cursor, 3);
  assert.ok(state.cursor <= state.shown.length);
});
