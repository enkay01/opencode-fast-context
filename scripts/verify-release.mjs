#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { runCli } from "./cli.mjs";

const ALLOWED_TOP = new Set([
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "LICENSE",
]);

const ALLOWED_DUMMIES = [
  "dummy-smoke-key",
  "dummy-typesafe-key-0123456789",
  "sk_live_abcdefghijklmnop",
  "AKIAIOSFODNN7EXAMPLE",
  "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  "abcdefghijklmnopqrstuvwxyz",
  "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC",
];

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{0,200}?[A-Za-z0-9+/]{40,}/,
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /xox[abprs]-[A-Za-z0-9-]{10,}/,
  /TYPESAFE_API_KEY\s*=\s*["']?[A-Za-z0-9_-]{20,}/,
];

const failures = [];

function run(command, args, options = {}) {
  return runCli(command, args, options);
}

function filesUnder(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  walk(root);
  return files.sort();
}

function step(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`FAIL ${name}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function scrubDummies(line) {
  let output = line;
  for (const dummy of ALLOWED_DUMMIES) output = output.split(dummy).join("");
  return output;
}

function scan(text, where) {
  // Remove only the exact synthetic fixture block, never a real key.
  const fixture =
    /-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\\n-----END PRIVATE KEY-----/g;
  const fixtureMultiline =
    /-----BEGIN PRIVATE KEY-----\s*\n?\s*MIIEvQIBADANBgkqhkiG9w0BAQEFAASC\s*\n?\s*-----END PRIVATE KEY-----/g;
  text = text.replace(fixture, "").replace(fixtureMultiline, "");
  for (const line of text.split("\n")) {
    const normalized = scrubDummies(line);
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(normalized)) throw new Error(`credential-shaped text in ${where}: ${line.slice(0, 80)}`);
    }
  }
}

const ABSOLUTE_PATH =
  /(?:\/Users\/|\/home\/|\/root\/|\/private\/tmp\/|\/var\/folders\/|[A-Za-z]:\\|\\\\\?\\)/;

step("typecheck", () => run("npm", ["run", "-s", "typecheck"]));
step("tests", () => run("npm", ["test"]));
step("build", () => run("npm", ["run", "-s", "build"]));
step("agent contract drift", () => run("node", ["scripts/generate-agent-contract.mjs", "--check"]));
step("OpenCode 2 API smoke", () => run("node", ["scripts/smoke-opencode.mjs"]));
step("OpenCode 2 runtime contract capture", () => run("node", ["scripts/smoke-contract-runtime.mjs"]));
step("OpenCode 2 runtime load smoke", () => run("node", ["scripts/smoke-runtime.mjs"]));

const packJson = JSON.parse(
  run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"]),
);
const packedFiles = packJson[0].files.map((file) => file.path).sort();

step("package allowlist", () => {
  assert(packedFiles.length > 0, "empty package");
  for (const file of packedFiles) {
    if (file.startsWith("dist/")) continue;
    assert(ALLOWED_TOP.has(file), `unexpected packed file: ${file}`);
  }
  assert(packedFiles.includes("dist/index.js"), "missing dist/index.js");
  assert(packedFiles.includes("dist/index.d.ts"), "missing declarations");
});

step("no source, maps, or benchmark files in package", () => {
  for (const file of packedFiles) {
    assert(!file.startsWith("src/"), `source file packed: ${file}`);
    assert(!file.startsWith("test/"), `test file packed: ${file}`);
    assert(!file.startsWith("bench/"), `benchmark file packed: ${file}`);
    assert(!file.endsWith(".map"), `source map packed: ${file}`);
  }
});

const work = await mkdtemp(join(tmpdir(), "fast-context-pack-"));
try {
  const pack = JSON.parse(
    run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", work]),
  );
  const tarball = join(work, pack[0].filename);

  step("tarball secret scan", () => {
    const listing = run("tar", ["-tzf", tarball]);
    for (const file of listing.split("\n").filter(Boolean)) {
      assert(!/\.(env|pem|key|p12|pfx)$/.test(file), `sensitive file packed: ${file}`);
    }
    run("tar", ["-xzf", tarball, "-C", work]);
    const extracted = join(work, "package");
    for (const file of filesUnder(extracted)) {
      scan(readFileSync(file, "utf8"), relative(work, file));
    }
  });

  step("packed files contain no absolute local paths", () => {
    const extracted = join(work, "package");
    for (const file of filesUnder(extracted)) {
      if (file.endsWith("package.json")) continue;
      const content = readFileSync(file, "utf8");
      assert(!ABSOLUTE_PATH.test(content), `absolute local path in ${relative(work, file)}`);
      assert(!content.includes("sourceMappingURL"), `source map reference in ${relative(work, file)}`);
    }
  });
} finally {
  await rm(work, { recursive: true, force: true });
}

step("tracked tree secret scan", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "buffer" })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  for (const file of files) {
    try {
      const content = readFileSync(file, "utf8");
      if (content.length > 1_000_000) continue;
      scan(content, file);
    } catch {
      // deleted, binary, or unreadable file
    }
  }
});

step("git history secret scan", () => {
  scan(run("git", ["log", "-p", "--all"]), "git history");
});

step("working tree is clean", () => {
  if (process.env.FAST_CONTEXT_ALLOW_DIRTY === "1") return;
  const status = run("git", ["status", "--porcelain"]).trim();
  assert(status === "", `uncommitted files:\n${status}`);
});

console.log("\nPacked files:");
for (const file of packedFiles) console.log(`  ${file}`);

if (failures.length > 0) {
  console.error(`\nrelease verification failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nrelease verification passed");
