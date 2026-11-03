#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PLUGIN_ID = "fast-context";
const PACKAGE_NAME = "opencode-fast-context";
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
    } else fail(`unknown argument: ${arg}`);
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
    const jsonc = join(configHome, "opencode", "opencode.jsonc");
    return { path: existsSync(jsonc) ? jsonc : join(configHome, "opencode", "opencode.json") };
  }
  const cwd = process.cwd();
  const jsonc = join(cwd, "opencode.jsonc");
  return { path: existsSync(jsonc) ? jsonc : join(cwd, "opencode.json") };
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

/** Remove JSONC comments and trailing commas without touching string contents. */
export function stripJsonc(text) {
  let output = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        output += char;
      }
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      } else if (char === "\n") {
        output += char;
      }
      continue;
    }
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    output += char;
  }

  return output.replace(/,(\s*[}\]])/g, "$1");
}

export function parseConfig(text) {
  const parsed = JSON.parse(stripJsonc(text));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("configuration must be a JSON object");
  }
  return parsed;
}

export function pluginEntries(config) {
  const plugins = config.plugins;
  if (plugins === undefined) return [];
  if (!Array.isArray(plugins)) throw new Error("plugins must be an array");
  return plugins;
}

export function entrySpec(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && typeof entry.package === "string") return entry.package;
  return null;
}

export function isFastContextEntry(entry, target) {
  const spec = entrySpec(entry);
  if (!spec) return false;
  return (
    spec === target ||
    spec === PLUGIN_ID ||
    spec === PACKAGE_NAME ||
    spec.startsWith(`${PACKAGE_NAME}@`) ||
    spec.startsWith(`${PACKAGE_NAME}/`)
  );
}

/** Find the `plugins` array bounds in the original text, ignoring comments and strings. */
function findPluginsArray(text) {
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      if (text.startsWith('"plugins"', index)) {
        let cursor = index + '"plugins"'.length;
        while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
        if (text[cursor] === ":") {
          cursor += 1;
          while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
          if (text[cursor] === "[") {
            const open = cursor;
            let depth = 0;
            let arrayString = false;
            let arrayEscaped = false;
            for (let scan = open; scan < text.length; scan += 1) {
              const item = text[scan];
              if (arrayString) {
                if (arrayEscaped) arrayEscaped = false;
                else if (item === "\\") arrayEscaped = true;
                else if (item === '"') arrayString = false;
                continue;
              }
              if (item === '"') arrayString = true;
              else if (item === "[") depth += 1;
              else if (item === "]") {
                depth -= 1;
                if (depth === 0) return { open, close: scan };
              }
            }
          }
        }
      }
      inString = true;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
    }
  }
  return null;
}

function formatEntries(entries) {
  if (entries.length === 0) return "[]";
  return `[\n    ${entries.map((entry) => JSON.stringify(entry)).join(",\n    ")}\n  ]`;
}

export function writePlugins(text, entries) {
  const array = findPluginsArray(text);
  if (array) {
    return `${text.slice(0, array.open)}${formatEntries(entries)}${text.slice(array.close + 1)}`;
  }
  const close = text.lastIndexOf("}");
  if (close < 0) throw new Error("configuration is not a JSON object");
  const prefix = text.slice(0, close).replace(/\s*$/, "");
  const comma = prefix.endsWith("{") || prefix.endsWith(",") ? "" : ",";
  return `${prefix}${comma}\n  "plugins": ${formatEntries(entries)}\n}${text.slice(close + 1)}`;
}

async function verifyIdentity(target) {
  if (!target.startsWith("file://")) return;
  const entry = new URL(target);
  const modulePath = join(entry.pathname, "dist", "index.js");
  if (!existsSync(modulePath)) fail(`built plugin not found at ${modulePath}; run npm run build first`);
  const module = await import(pathToFileURL(modulePath).href);
  if (module.default?.id !== PLUGIN_ID) {
    fail(`plugin identity mismatch: expected ${PLUGIN_ID}, found ${String(module.default?.id)}`);
  }
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
  const existingText = existsSync(config.path) ? await readFile(config.path, "utf8") : "{}\n";
  let parsed;
  try {
    parsed = parseConfig(existingText);
  } catch (error) {
    fail(`cannot parse ${config.path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const entries = pluginEntries(parsed);
  const present = entries.some((entry) => isFastContextEntry(entry, target));

  if (args.remove) {
    if (!present) {
      console.log(`No Fast Context plugin entry found in ${config.path}; nothing to remove.`);
      return;
    }
    const remaining = entries.filter((entry) => !isFastContextEntry(entry, target));
    await mkdir(dirname(config.path), { recursive: true });
    await atomicWrite(config.path, writePlugins(existingText, remaining));
    const after = parseConfig(await readFile(config.path, "utf8"));
    if (pluginEntries(after).some((entry) => isFastContextEntry(entry, target))) {
      fail("removal did not stick; configuration still contains the plugin");
    }
    console.log(`Removed the Fast Context plugin from ${config.path}. Restart OpenCode.`);
    return;
  }

  if (present) {
    await verifyIdentity(target);
    console.log(`Already configured in ${config.path}; no change.`);
    console.log(`Plugin id: ${PLUGIN_ID}`);
    console.log(`Remove with: npm run setup:opencode -- --remove --scope ${args.scope}`);
    return;
  }

  const nextText = writePlugins(existingText, [...entries, target]);
  await mkdir(dirname(config.path), { recursive: true });
  await atomicWrite(config.path, nextText);

  const after = parseConfig(await readFile(config.path, "utf8"));
  if (!pluginEntries(after).some((entry) => isFastContextEntry(entry, target))) {
    fail("configuration was written but the plugin entry is not present; inspect the file");
  }
  await verifyIdentity(target);

  console.log(`Added ${target} to ${config.path}.`);
  console.log(`Plugin id: ${PLUGIN_ID}`);
  console.log(`TYPESAFE_API_KEY: ${credentialPresent() ? "present" : "missing"}`);
  console.log(`Restart OpenCode from the same environment.`);
  console.log(`Remove with: npm run setup:opencode -- --remove --scope ${args.scope}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
