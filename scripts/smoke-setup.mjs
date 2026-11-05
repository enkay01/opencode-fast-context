#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const root = await mkdtemp(join(tmpdir(), "fast-context-setup-smoke-"));
const configHome = join(root, "config-home");
await mkdir(configHome, { recursive: true });

const env = { ...process.env };
delete env.FAST_CONTEXT_SETUP_SKIP_CHECKS;
delete env.TYPESAFE_API_KEY;
// Point the user-level config lookup at the scratch directory so the smoke
// never reads or writes a real OpenCode configuration.
env.HOME = configHome;
env.USERPROFILE = configHome;
env.XDG_CONFIG_HOME = configHome;

try {
  const target = pathToFileURL(repo).href;
  const script = join(repo, "scripts", "setup-opencode.mjs");
  const args = [script, "--scope", "project", "--package", target, "--allow-missing-credential"];

  const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `setup failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  assert.match(result.stdout, /Plugin id: fast-context/);
  assert.doesNotMatch(result.stderr, /not available on PATH/);

  const config = JSON.parse(await readFile(join(root, "opencode.json"), "utf8"));
  assert.ok(config.plugins.includes(target), "plugin was not registered");
  assert.equal(config.plugins.length, 1, "unexpected extra plugin entries");

  const second = spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8" });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /no change/);
  console.log("setup smoke: prerequisite checks, install, and idempotent rerun passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
