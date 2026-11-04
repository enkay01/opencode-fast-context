import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("public package exports only the OpenCode 2 entrypoint", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(Object.keys(pkg.exports), [".", "./package.json"]);
  assert.ok(!JSON.stringify(pkg.exports).includes("legacy"));
  assert.ok(!JSON.stringify(pkg).toLowerCase().includes("clef"));
  assert.ok(pkg.files.every((entry: string) => entry.startsWith("dist/") || ["README.md", "CHANGELOG.md", "SECURITY.md", "LICENSE"].includes(entry)));
  assert.match(pkg.peerDependencies["@opencode/plugin"], /^\^2\./);
  assert.equal(pkg.devDependencies["@opencode-ai/plugin"], undefined);
});
