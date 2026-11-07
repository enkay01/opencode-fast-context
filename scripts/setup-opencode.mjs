#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runCli } from "./cli.mjs";

const PLUGIN_ID = "fast-context";
const PACKAGE_NAME = "opencode-fast-context";
const DEFAULT_PACKAGE = pathToFileURL(resolve(process.cwd())).href;

function parseArgs(argv) {
  const args = {
    scope: "project",
    package: DEFAULT_PACKAGE,
    remove: false,
    allowMissingCredential: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--remove") args.remove = true;
    else if (arg === "--scope") args.scope = argv[++index];
    else if (arg === "--package") args.package = argv[++index];
    else if (arg === "--allow-missing-credential") args.allowMissingCredential = true;
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
A missing TYPESAFE_API_KEY is allowed; the plugin prompts in the OpenCode TUI on the first search.
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
  let version;
  try {
    version = runCli("opencode", ["--version"]).trim();
  } catch {
    fail("opencode is not available on PATH");
  }
  const major = Number(version.match(/(\d+)\./)?.[1] ?? 0);
  if (major < 2) fail(`OpenCode 2 is required; found ${version}`);

  try {
    runCli("rg", ["--version"]);
  } catch {
    fail("ripgrep (rg) is not available on PATH");
  }
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

function isLocalFastContextPath(spec) {
  if (!spec.startsWith("file://")) return false;
  try {
    const directory = fileURLToPath(spec);
    if (basename(directory) === PACKAGE_NAME) return true;
    const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
    return pkg?.name === PACKAGE_NAME;
  } catch {
    return false;
  }
}

/** True for any Fast Context entry, including old versions and other checkouts. */
export function isFastContextEntry(entry, target) {
  const spec = entrySpec(entry);
  if (!spec) return false;
  if (target && spec === target) return true;
  if (
    spec === PLUGIN_ID ||
    spec === PACKAGE_NAME ||
    spec.startsWith(`${PACKAGE_NAME}@`) ||
    spec.startsWith(`${PACKAGE_NAME}/`)
  ) {
    return true;
  }
  return isLocalFastContextPath(spec);
}

/** True only for the exact requested spec. */
export function isExactTarget(entry, target) {
  return entrySpec(entry) === target;
}

function replaceEntry(entry, target) {
  if (entry && typeof entry === "object" && typeof entry.package === "string") {
    return { ...entry, package: target };
  }
  return target;
}

function assertExactTarget(entries, target, context) {
  const owned = entries.filter((entry) => isFastContextEntry(entry, target));
  if (owned.length !== 1 || !isExactTarget(owned[0], target)) {
    throw new Error(`${context}: expected exactly one entry for ${target}`);
  }
}

function skipTrivia(text, index) {
  let cursor = index;
  while (cursor < text.length) {
    if (/\s/.test(text[cursor])) {
      cursor += 1;
      continue;
    }
    if (text[cursor] === "/" && text[cursor + 1] === "/") {
      cursor = text.indexOf("\n", cursor);
      if (cursor < 0) return text.length;
      continue;
    }
    if (text[cursor] === "/" && text[cursor + 1] === "*") {
      const close = text.indexOf("*/", cursor + 2);
      if (close < 0) return text.length;
      cursor = close + 2;
      continue;
    }
    break;
  }
  return cursor;
}

function readString(text, index) {
  let cursor = index + 1;
  let escaped = false;
  let value = "";
  while (cursor < text.length) {
    const char = text[cursor];
    if (escaped) {
      value += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      return { value, end: cursor };
    } else {
      value += char;
    }
    cursor += 1;
  }
  return { value, end: cursor };
}

function scanArrayClose(text, open) {
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      index = readString(text, index).end + 1;
      continue;
    }
    if (char === "/" && next === "/") {
      const line = text.indexOf("\n", index);
      index = line < 0 ? text.length : line + 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const close = text.indexOf("*/", index + 2);
      index = close < 0 ? text.length : close + 2;
      continue;
    }
    if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return -1;
}

/** Find the top-level `plugins` array, ignoring nested objects and comments. */
export function findPluginsArray(text) {
  let index = 0;
  let depth = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      const token = readString(text, index);
      if (depth === 1 && token.value === "plugins") {
        let cursor = skipTrivia(text, token.end + 1);
        if (text[cursor] === ":") {
          cursor = skipTrivia(text, cursor + 1);
          if (text[cursor] === "[") {
            const close = scanArrayClose(text, cursor);
            if (close >= 0) return { open: cursor, close };
          }
        }
      }
      index = token.end + 1;
      continue;
    }
    if (char === "/" && next === "/") {
      const line = text.indexOf("\n", index);
      index = line < 0 ? text.length : line + 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const close = text.indexOf("*/", index + 2);
      index = close < 0 ? text.length : close + 2;
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") depth -= 1;
    index += 1;
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
  const directory = fileURLToPath(target);
  const modulePath = join(directory, "dist", "index.js");
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

  if (!args.remove && !args.allowMissingCredential && !credentialPresent()) {
    console.log(
      "note: TYPESAFE_API_KEY is not set. The plugin prompts for a TypeSafe key inside the OpenCode TUI " +
        "on the first search; headless runs return fallback_required until a key is stored.",
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
  const owned = entries.filter((entry) => isFastContextEntry(entry, target));
  const present = owned.length > 0;
  /** Only a lone, exact entry is already configured; duplicates must be normalized. */
  const configured = owned.length === 1 && isExactTarget(owned[0], target);

  if (args.remove) {
    if (!present) {
      console.log(`No Fast Context plugin entry found in ${config.path}; nothing to remove.`);
      return;
    }
    const remaining = entries.filter((entry) => !isFastContextEntry(entry, target));
    const candidateText = writePlugins(existingText, remaining);
    const candidate = parseConfig(candidateText);
    if (pluginEntries(candidate).some((entry) => isFastContextEntry(entry, target))) {
      fail("removal candidate still contains the plugin; refusing to write");
    }
    await mkdir(dirname(config.path), { recursive: true });
    await atomicWrite(config.path, candidateText);
    const after = parseConfig(await readFile(config.path, "utf8"));
    if (pluginEntries(after).some((entry) => isFastContextEntry(entry, target))) {
      fail("removal did not stick; configuration still contains the plugin");
    }
    console.log(`Removed the Fast Context plugin from ${config.path}. Restart OpenCode.`);
    return;
  }

  if (configured) {
    await verifyIdentity(target);
    console.log(`Already configured in ${config.path}; no change.`);
    console.log(`Plugin id: ${PLUGIN_ID}`);
    console.log(`Remove with: npm run setup:opencode -- --remove --scope ${args.scope}`);
    return;
  }

  const upgraded = present;
  let nextEntries;
  if (upgraded) {
    let replaced = false;
    nextEntries = entries.flatMap((entry) => {
      if (!isFastContextEntry(entry, target)) return [entry];
      if (replaced) return [];
      replaced = true;
      return [replaceEntry(entry, target)];
    });
  } else {
    nextEntries = [...entries, target];
  }

  const nextText = writePlugins(existingText, nextEntries);
  const candidate = parseConfig(nextText);
  try {
    assertExactTarget(pluginEntries(candidate), target, "setup candidate");
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  await mkdir(dirname(config.path), { recursive: true });
  await atomicWrite(config.path, nextText);

  const after = parseConfig(await readFile(config.path, "utf8"));
  try {
    assertExactTarget(pluginEntries(after), target, "final configuration");
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  await verifyIdentity(target);

  console.log(`${upgraded ? "Updated" : "Added"} ${target} in ${config.path}.`);
  console.log(`Plugin id: ${PLUGIN_ID}`);
  console.log(
    `TYPESAFE_API_KEY: ${credentialPresent() ? "present" : "missing (the plugin prompts in the OpenCode TUI on first search)"}`,
  );
  console.log(`Restart OpenCode from the same environment.`);
  console.log(`Remove with: npm run setup:opencode -- --remove --scope ${args.scope}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
