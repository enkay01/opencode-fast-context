import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repo = resolve(".");
const target = `file://${repo}`;

test("setup is idempotent, preserves plugins, and never writes the credential", async () => {
  const root = await mkdtemp(join(tmpdir(), "fast-context-setup-"));
  const config = join(root, "opencode.jsonc");
  await writeFile(
    config,
    '{\n  // keep this comment\n  "plugins": ["existing-plugin"],\n  "model": "x"\n}\n',
  );
  const env = {
    ...process.env,
    FAST_CONTEXT_SETUP_SKIP_CHECKS: "1",
    TYPESAFE_API_KEY: "dummy-setup-key",
  };
  const run = (...args: string[]) =>
    execFileSync("node", [join(repo, "scripts", "setup-opencode.mjs"), ...args], {
      cwd: root,
      env,
      encoding: "utf8",
    });

  try {
    const first = run("--scope", "project", "--package", target);
    assert.match(first, /Plugin id: fast-context/);
    const text = await readFile(config, "utf8");
    assert.match(text, /existing-plugin/);
    assert.ok(text.includes(target));
    assert.ok(!text.includes("dummy-setup-key"));
    assert.match(text, /keep this comment/);

    const second = run("--scope", "project", "--package", target);
    assert.match(second, /no change/);
    assert.equal(await readFile(config, "utf8"), text);

    run("--remove", "--scope", "project", "--package", target);
    const removed = await readFile(config, "utf8");
    assert.ok(!removed.includes(target));
    assert.match(removed, /existing-plugin/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("setup supports the global scope with XDG_CONFIG_HOME", async () => {
  const home = await mkdtemp(join(tmpdir(), "fast-context-home-"));
  const configHome = join(home, "config");
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: configHome,
    FAST_CONTEXT_SETUP_SKIP_CHECKS: "1",
    TYPESAFE_API_KEY: "dummy-setup-key",
  };
  try {
    execFileSync("node", [join(repo, "scripts", "setup-opencode.mjs"), "--scope", "global", "--package", target], {
      cwd: repo,
      env,
      encoding: "utf8",
    });
    const config = await readFile(join(configHome, "opencode", "opencode.json"), "utf8");
    assert.ok(config.includes(target));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
