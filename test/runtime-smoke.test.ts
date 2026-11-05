import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { assertRuntimeLoad } from "../scripts/smoke-runtime.mjs";

const line = (path: string) =>
  `2026-11-04T00:00:00Z level=INFO msg="loading plugin" id=${path} entrypoint=${pathToFileURL(path).href}/dist/index.js http.span=63 role=server`;

test("runtime load matches the entrypoint even when the clone directory is not the package name", () => {
  const repo = join(tmpdir(), "fast-context-rereview.InTyl4", "repo");
  assert.doesNotThrow(() => assertRuntimeLoad(line(repo), repo));
});

test("runtime load rejects a different checkout path", () => {
  const other = join(tmpdir(), "fast-context-other", "repo");
  const expected = join(tmpdir(), "fast-context-expected", "repo");
  assert.throws(() => assertRuntimeLoad(line(other), expected), /expected/);
});

test("runtime load rejects a plugin load failure", () => {
  assert.throws(
    () => assertRuntimeLoad('msg="failed to load plugin" target=fast-context', join(tmpdir(), "repo")),
    /load failure/,
  );
});
