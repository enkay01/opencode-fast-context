#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REQUIRED = [2, 2, 5];
const repo = resolve(process.cwd());
const home = await mkdtemp(join(tmpdir(), "fast-context-runtime-"));

function parseVersion(output) {
  const match = /v?(\d+)\.(\d+)\.(\d+)/.exec(output);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function atLeast(version, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (version[index] > minimum[index]) return true;
    if (version[index] < minimum[index]) return false;
  }
  return true;
}

try {
  const check = spawnSync("opencode", ["--version"], { encoding: "utf8" });
  if (check.status !== 0) {
    throw new Error("opencode is not available; install OpenCode 2 before running this smoke");
  }
  const version = parseVersion(String(check.stdout).trim());
  assert.ok(version, `could not parse OpenCode version: ${check.stdout}`);
  assert.ok(
    atLeast(version, REQUIRED),
    `OpenCode ${REQUIRED.join(".")} or newer is required; found ${version.join(".")}`,
  );

  const configDir = join(home, ".config", "opencode");
  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, "opencode.json"),
    `${JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      plugins: [`file://${repo}`],
    })}\n`,
  );

  const env = { ...process.env, HOME: home };
  delete env.TYPESAFE_API_KEY;
  const run = spawnSync(
    "opencode",
    [
      "run",
      "--standalone",
      "--model",
      "invalid/nonexistent",
      "--print-logs",
      "--log-level",
      "info",
      "runtime smoke",
    ],
    { encoding: "utf8", env, timeout: 120_000 },
  );
  const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;

  assert.ok(!/failed to load plugin/i.test(output), "OpenCode reported a plugin load failure");
  assert.ok(/loading plugin/i.test(output), "OpenCode did not report loading the plugin");
  assert.ok(
    output.includes("opencode-fast-context") && output.includes("dist/index.js"),
    "OpenCode did not load this checkout's dist/index.js",
  );

  console.log(`runtime smoke: OpenCode ${version.join(".")} loaded ${repo}/dist/index.js without a provider call`);
} finally {
  await rm(home, { recursive: true, force: true });
}
