#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch } from "./cli.mjs";

const REQUIRED = [2, 2, 5];

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

export function loadedEntrypoints(output) {
  return [...output.matchAll(/entrypoint=(file:\/\/[^\s"]+)/g)].map((match) => {
    try {
      return fileURLToPath(match[1]);
    } catch {
      return null;
    }
  });
}

/** Assert the logged entrypoint is this checkout, regardless of the directory name. */
export function assertRuntimeLoad(output, repoRoot) {
  assert.ok(!/failed to load plugin/i.test(output), "OpenCode reported a plugin load failure");
  assert.ok(/loading plugin/i.test(output), `OpenCode did not report loading the plugin. Output:\n${output.slice(-2000)}`);
  const expected = resolve(repoRoot, "dist", "index.js");
  const entrypoints = loadedEntrypoints(output).filter(Boolean).map((entry) => resolve(entry));
  assert.ok(
    entrypoints.includes(expected),
    `OpenCode loaded ${entrypoints.join(", ") || "nothing"}; expected ${expected}. Output:\n${output.slice(-2000)}`,
  );
}

async function main() {
  const repo = resolve(process.cwd());
  const home = await mkdtemp(join(tmpdir(), "fast-context-runtime-"));
  try {
    const versionPlan = launch("opencode", ["--version"]);
    const check = spawnSync(versionPlan.file, versionPlan.args, {
      encoding: "utf8",
      ...versionPlan.options,
    });
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
        plugins: [pathToFileURL(repo).href],
      })}\n`,
    );

    const env = {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: join(home, ".config"),
      XDG_DATA_HOME: join(home, ".local", "share"),
      XDG_STATE_HOME: join(home, ".local", "state"),
      XDG_CACHE_HOME: join(home, ".cache"),
    };
    delete env.TYPESAFE_API_KEY;
    const runPlan = launch("opencode", [
      "run",
      "--standalone",
      "--model",
      "invalid/nonexistent",
      "--print-logs",
      "--log-level",
      "info",
      "runtime smoke",
    ]);
    const run = spawnSync(
      runPlan.file,
      runPlan.args,
      { encoding: "utf8", env, timeout: 120_000, ...runPlan.options },
    );
    const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
    assertRuntimeLoad(output, repo);

    console.log(`runtime smoke: OpenCode ${version.join(".")} loaded ${repo}/dist/index.js without a provider call`);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
