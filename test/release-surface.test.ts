import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("public package exports the OpenCode 2 server and TUI entrypoints", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(Object.keys(pkg.exports), [".", "./tui", "./package.json"]);
  assert.ok(!JSON.stringify(pkg.exports).includes("legacy"));
  assert.ok(!JSON.stringify(pkg).toLowerCase().includes("clef"));
  assert.ok(pkg.files.every((entry: string) => entry.startsWith("dist/") || ["README.md", "CHANGELOG.md", "SECURITY.md", "LICENSE"].includes(entry)));
  assert.match(pkg.peerDependencies["@opencode/plugin"], /^\^2\./);
  assert.ok(pkg.dependencies?.["@opentui/solid"], "the TUI JSX runtime must be a production dependency");
  assert.ok(pkg.dependencies?.["solid-js"], "the TUI reactivity runtime must be a production dependency");
  assert.equal(pkg.devDependencies["@opencode-ai/plugin"], undefined);
});
