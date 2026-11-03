#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PLUGIN_ID = "fast-context";
const DEFAULT_PACKAGE = `file://${resolve(process.cwd())}`;

function parseArgs(argv) {
  const args = { scope: "project", package: DEFAULT_PACKAGE, remove: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--remove") args.remove = true;
    else if (arg === "--scope") args.scope = argv[++index];
    else if (arg === "--package") args.package = argv[++index];
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  if (args.scope !== "project" && args.scope !== "global") fail("--scope must be project or global");
  return args;
}

function printHelp() {
  console.log(`Usage: npm run setup:opencode -- [--scope project|global] [--package <spec>] [--remove]

Registers the Fast Context plugin in OpenCode 2 configuration.
It never accepts, reads, prints, or writes TYPESAFE_API_KEY.
`);
}

function fail(message) {
  console.error(`setup-opencode: ${message}`);
  process.exit(1);
}

function configPath(scope) {
  if (scope === "global") {
    const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    const directory = join(configHome, "opencode");
    const jsonc = join(directory, "opencode.jsonc");
    return { path: existsSync(jsonc) ? jsonc : join(directory, "opencode.json"), directory, create: !existsSync(jsonc) };
  }
  const cwd = process.cwd();
  const jsonc = join(cwd, "opencode.jsonc");
  if (existsSync(jsonc)) return { path: jsonc, directory: cwd, create: false };
  const json = join(cwd, "opencode.json");
  return { path: json, directory: cwd, create: false };
}

function checkPrerequisites() {
  if (process.env.FAST_CONTEXT_SETUP_SKIP_CHECKS === "1") return;
  const opencode = spawnSync("opencode", ["--version"], { encoding: "utf8" });
  if (opencode.status !== 0) fail("opencode is not available on PATH");
  const version = String(opencode.stdout).trim();
  const major = Number(version.match(/(\d+)\./)?.[1] ?? 0);
  if (major < 2) fail(`OpenCode 2 is required; found ${version}`);

  const rg = spawnSync("rg", ["--version"], { encoding: "utf8" });
  if (rg.status !== 0) fail("ripgrep (rg) is not available on PATH");
}

function credentialPresent() {
  return typeof process.env.TYPESAFE_API_KEY === "string" && process.env.TYPESAFE_API_KEY.length > 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPlugin(text, target) {
  return new RegExp(`["']${escapeRegExp(target)}["']`).test(text) ||
    new RegExp(`["']${escapeRegExp(PLUGIN_ID)}["']`).test(text);
}

function addPlugin(text, target) {
  const array = /"plugins"\s*:\s*\[([\s\S]*?)\]/.exec(text);
  if (array) {
    const content = array[1].trim();
    if (content.length === 0) {
      return text.replace(array[0], `"plugins": [\n    "${target}"\n  ]`);
    }
    return text.replace(array[0], `"plugins": [\n    "${target}",${array[1]}]`);
  }
  const close = text.lastIndexOf("}");
  if (close < 0) fail("configuration is not a JSON object");
  const prefix = text.slice(0, close).replace(/\s*$/, "");
  const comma = prefix.endsWith("{") || prefix.endsWith(",") ? "" : ",";
  return `${prefix}${comma}\n  "plugins": ["${target}"]\n}${text.slice(close + 1)}`;
}

function removePlugin(text, target) {
  return text.replace(/("plugins"\s*:\s*\[)([\s\S]*?)(\])/, (match, open, body, close) => {
    let next = String(body);
    for (const value of [target, PLUGIN_ID]) {
      next = next.replace(new RegExp(`\\s*"${escapeRegExp(value)}"\\s*,?`), "");
    }
    next = next.replace(/,\s*$/, "");
    return `${open}${next}${close}`;
  });
}

async function verifyIdentity(target) {
  const entry = target.startsWith("file://") ? new URL(target) : null;
  if (!entry) return;
  const modulePath = join(entry.pathname, "dist", "index.js");
  if (!existsSync(modulePath)) fail(`built plugin not found at ${modulePath}; run npm run build first`);
  const module = await import(pathToFileURL(modulePath).href);
  const id = module.default?.id;
  if (id !== PLUGIN_ID) fail(`plugin identity mismatch: expected ${PLUGIN_ID}, found ${String(id)}`);
}

async function atomicWrite(path, content) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, path);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  checkPrerequisites();

  if (!args.remove && !credentialPresent()) {
    fail(
      "TYPESAFE_API_KEY is not present in this environment. Provision it through your secret manager " +
        "or shell, then rerun. The value is never read or printed by this script.",
    );
  }

  const target = args.package;
  const config = configPath(args.scope);
  const existing = existsSync(config.path) ? await readFile(config.path, "utf8") : "{}\n";
  const already = hasPlugin(existing, target);

  if (args.remove) {
    if (!already) {
      console.log(`No Fast Context plugin entry found in ${config.path}; nothing to remove.`);
      return;
    }
    await atomicWrite(config.path, removePlugin(existing, target));
    console.log(`Removed ${target} from ${config.path}. Restart OpenCode.`);
    return;
  }

  if (already) {
    await verifyIdentity(target);
    console.log(`Already configured in ${config.path}; no change.`);
    console.log(`Plugin id: ${PLUGIN_ID}`);
    console.log(`Remove with: npm run setup:opencode -- --remove --scope ${args.scope}`);
    return;
  }

  await mkdir(dirname(config.path), { recursive: true });
  await atomicWrite(config.path, addPlugin(existing, target));
  await verifyIdentity(target);

  console.log(`Added ${target} to ${config.path}.`);
  console.log(`Plugin id: ${PLUGIN_ID}`);
  console.log(`TYPESAFE_API_KEY: ${credentialPresent() ? "present" : "missing"}`);
  console.log(`Restart OpenCode from the same environment.`);
  console.log(`Remove with: npm run setup:opencode -- --remove --scope ${args.scope}`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
