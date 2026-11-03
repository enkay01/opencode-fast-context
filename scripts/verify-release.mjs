#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

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
];

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /xox[abprs]-[A-Za-z0-9-]{10,}/,
  /TYPESAFE_API_KEY\s*=\s*["']?[A-Za-z0-9_-]{20,}/,
];

const failures = [];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
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

function scan(text, where) {
  for (const line of text.split("\n")) {
    if (ALLOWED_DUMMIES.some((dummy) => line.includes(dummy))) continue;
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(line)) throw new Error(`credential-shaped text in ${where}: ${line.slice(0, 80)}`);
    }
  }
}

step("typecheck", () => run("npm", ["run", "-s", "typecheck"]));
step("tests", () => run("npm", ["test"]));
step("build", () => run("npm", ["run", "-s", "build"]));
step("OpenCode 2 API smoke", () => run("node", ["scripts/smoke-opencode.mjs"]));

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
    const files = run("find", [extracted, "-type", "f"]);
    for (const file of files.split("\n").filter(Boolean)) {
      const content = run("cat", [file]);
      scan(content, relative(work, file));
    }
  });

  step("packed files contain no absolute local paths", () => {
    const extracted = join(work, "package");
    const files = run("find", [extracted, "-type", "f"]);
    for (const file of files.split("\n").filter(Boolean)) {
      if (file.endsWith("package.json")) continue;
      const content = run("cat", [file]);
      assert(!content.includes("/Users/"), `absolute user path in ${relative(work, file)}`);
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
