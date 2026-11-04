import assert from "node:assert/strict";
import { test } from "node:test";
import { assertRuntimeLoad } from "../scripts/smoke-runtime.mjs";

const line = (path: string) =>
  `2026-11-04T00:00:00Z level=INFO msg="loading plugin" id=${path} entrypoint=file://${path}/dist/index.js http.span=63 role=server`;

test("runtime load matches the entrypoint even when the clone directory is not the package name", () => {
  const repo = "/private/tmp/fast-context-rereview.InTyl4/repo";
  assert.doesNotThrow(() => assertRuntimeLoad(line(repo), repo));
});

test("runtime load rejects a different checkout path", () => {
  assert.throws(() => assertRuntimeLoad(line("/tmp/other/repo"), "/tmp/expected/repo"), /expected/);
});

test("runtime load rejects a plugin load failure", () => {
  assert.throws(
    () => assertRuntimeLoad('msg="failed to load plugin" target=fast-context', "/tmp/repo"),
    /load failure/,
  );
});
