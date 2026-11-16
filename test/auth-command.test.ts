import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAuthCommand } from "../src/auth-command.ts";

test("the documented slash forms select the right action", () => {
  assert.deepEqual(parseAuthCommand("auth"), { action: "set" });
  assert.deepEqual(parseAuthCommand("auth status"), { action: "status" });
  assert.deepEqual(parseAuthCommand("auth revoke"), { action: "revoke" });
  assert.deepEqual(parseAuthCommand("auth help"), { action: "help" });
});

test("the optional auth word is accepted only in front", () => {
  assert.deepEqual(parseAuthCommand("auth set"), { action: "set" });
  assert.deepEqual(parseAuthCommand("status"), { action: "status" });
  assert.deepEqual(parseAuthCommand("revoke"), { action: "revoke" });
  assert.deepEqual(parseAuthCommand(""), { action: "select" });
  assert.deepEqual(parseAuthCommand("   "), { action: "select" });
});

test("provider selection and separate onboarding are explicit", () => {
  assert.deepEqual(parseAuthCommand("provider"), { action: "select" });
  assert.deepEqual(parseAuthCommand("use gemini"), { action: "select", provider: "gemini" });
  assert.deepEqual(parseAuthCommand("auth gemini"), { action: "set", provider: "gemini" });
  assert.deepEqual(parseAuthCommand("auth set jev"), { action: "set", provider: "jev" });
  assert.deepEqual(parseAuthCommand("auth revoke gemini"), { action: "revoke", provider: "gemini" });
});

test("aliases and case are normalized", () => {
  assert.deepEqual(parseAuthCommand("AUTH LOGIN"), { action: "set" });
  assert.deepEqual(parseAuthCommand("auth key"), { action: "set" });
  assert.deepEqual(parseAuthCommand("logout"), { action: "revoke" });
  assert.deepEqual(parseAuthCommand("remove"), { action: "revoke" });
});

test("an unknown action is reported with its token", () => {
  assert.deepEqual(parseAuthCommand("auth wat"), { action: "unknown", token: "wat" });
  assert.deepEqual(parseAuthCommand("wat"), { action: "unknown", token: "wat" });
});
