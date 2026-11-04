import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const repo = resolve(".");
const target = pathToFileURL(repo).href;

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

test("setup ignores comments and unrelated fast-context text", async () => {
  const root = await mkdtemp(join(tmpdir(), "fast-context-setup-"));
  const config = join(root, "opencode.jsonc");
  await writeFile(
    config,
    [
      "{",
      '  // fast-context must still be added even though this comment mentions it',
      '  "note": "fast-context",',
      '  "plugins": ["existing-plugin"],',
      '  "model": "x"',
      "}",
      "",
    ].join("\n"),
  );
  const env = {
    ...process.env,
    FAST_CONTEXT_SETUP_SKIP_CHECKS: "1",
    TYPESAFE_API_KEY: "dummy-setup-key",
  };
  try {
    execFileSync(
      "node",
      [join(repo, "scripts", "setup-opencode.mjs"), "--scope", "project", "--package", target],
      { cwd: root, env, encoding: "utf8" },
    );
    const text = await readFile(config, "utf8");
    assert.ok(text.includes(target));
    assert.match(text, /comment mentions it/);
    assert.match(text, /existing-plugin/);

    const setup = await import("../scripts/setup-opencode.mjs");
    const parsed = setup.parseConfig(text);
    const entries = setup.pluginEntries(parsed);
    assert.equal(entries.filter((entry: unknown) => setup.isFastContextEntry(entry, target)).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JSONC stripping respects comments inside strings", async () => {
  const setup = await import("../scripts/setup-opencode.mjs");
  const parsed = setup.parseConfig('{ // comment\n "url": "https://example.invalid/a//b", /* x */ "n": 1, }');
  assert.equal(parsed.url, "https://example.invalid/a//b");
  assert.equal(parsed.n, 1);
});

test("writePlugins edits only the top-level plugins array", async () => {
  const setup = await import("../scripts/setup-opencode.mjs");
  const text = '{"other":{"plugins":["nested"]},"plugins":["real"]}';
  const output = setup.writePlugins(text, ["real", target]);
  const parsed = setup.parseConfig(output);
  assert.deepEqual(parsed.other.plugins, ["nested"]);
  assert.deepEqual(parsed.plugins, ["real", target]);
});

test("setup handles a closing bracket inside a plugins comment", async () => {
  const setup = await import("../scripts/setup-opencode.mjs");
  const text = [
    "{",
    '  "plugins": [',
    '    "existing" // ] this bracket is not the end',
    "  ]",
    "}",
    "",
  ].join("\n");
  const output = setup.writePlugins(text, ["existing", target]);
  const parsed = setup.parseConfig(output);
  assert.deepEqual(parsed.plugins, ["existing", target]);
});

test("an older Fast Context version is owned but not an exact target", async () => {
  const setup = await import("../scripts/setup-opencode.mjs");
  assert.equal(setup.isFastContextEntry("opencode-fast-context@0.0.9"), true);
  assert.equal(setup.isExactTarget("opencode-fast-context@0.0.9", "opencode-fast-context@0.1.0"), false);
  assert.equal(setup.isExactTarget("opencode-fast-context@0.1.0", "opencode-fast-context@0.1.0"), true);
});

test("setup upgrades an older pinned version instead of claiming no change", async () => {
  const root = await mkdtemp(join(tmpdir(), "fast-context-upgrade-"));
  const config = join(root, "opencode.json");
  const targetSpec = "opencode-fast-context@0.1.0";
  await writeFile(config, '{"plugins":["opencode-fast-context@0.0.9"]}\n');
  const env = {
    ...process.env,
    FAST_CONTEXT_SETUP_SKIP_CHECKS: "1",
    TYPESAFE_API_KEY: "dummy-setup-key",
  };
  const run = () =>
    execFileSync(
      "node",
      [join(repo, "scripts", "setup-opencode.mjs"), "--scope", "project", "--package", targetSpec],
      { cwd: root, env, encoding: "utf8" },
    );
  try {
    assert.match(run(), /Updated/);
    const text = await readFile(config, "utf8");
    assert.ok(text.includes(targetSpec));
    assert.ok(!text.includes("0.0.9"));
    assert.match(run(), /no change/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("setup normalizes duplicate Fast Context entries to one exact target", async () => {
  const setup = await import("../scripts/setup-opencode.mjs");
  const root = await mkdtemp(join(tmpdir(), "fast-context-duplicates-"));
  const config = join(root, "opencode.json");
  const targetSpec = "opencode-fast-context@0.1.0";
  const env = {
    ...process.env,
    FAST_CONTEXT_SETUP_SKIP_CHECKS: "1",
    TYPESAFE_API_KEY: "dummy-setup-key",
  };
  const run = () =>
    execFileSync(
      "node",
      [join(repo, "scripts", "setup-opencode.mjs"), "--scope", "project", "--package", targetSpec],
      { cwd: root, env, encoding: "utf8" },
    );
  const ownedEntries = async () => {
    const parsed = setup.parseConfig(await readFile(config, "utf8"));
    return setup.pluginEntries(parsed).filter((entry: unknown) => setup.isFastContextEntry(entry, targetSpec));
  };

  try {
    // Both an old and the current spec: the exact entry must not mask the old one.
    await writeFile(
      config,
      '{"plugins":["opencode-fast-context@0.0.9","opencode-fast-context@0.1.0"]}\n',
    );
    assert.match(run(), /Updated/);
    let owned = await ownedEntries();
    assert.equal(owned.length, 1);
    assert.equal(setup.isExactTarget(owned[0], targetSpec), true);
    assert.ok(!(await readFile(config, "utf8")).includes("0.0.9"));

    // Two identical target entries: still duplicated, still normalized.
    await writeFile(config, `{"plugins":["${targetSpec}","${targetSpec}"]}\n`);
    assert.match(run(), /Updated/);
    owned = await ownedEntries();
    assert.equal(owned.length, 1);
    assert.equal(setup.isExactTarget(owned[0], targetSpec), true);

    // A lone exact entry is the only state that reports no change.
    assert.match(run(), /no change/);
    assert.equal((await ownedEntries()).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("setup replaces a different local checkout with the requested checkout", async () => {
  const root = await mkdtemp(join(tmpdir(), "fast-context-checkout-"));
  const oldCheckout = join(root, "old-checkout");
  await mkdir(oldCheckout, { recursive: true });
  await writeFile(join(oldCheckout, "package.json"), JSON.stringify({ name: "opencode-fast-context" }));
  const config = join(root, "opencode.json");
  await writeFile(config, JSON.stringify({ plugins: [pathToFileURL(oldCheckout).href] }));
  const env = {
    ...process.env,
    FAST_CONTEXT_SETUP_SKIP_CHECKS: "1",
    TYPESAFE_API_KEY: "dummy-setup-key",
  };
  try {
    execFileSync(
      "node",
      [join(repo, "scripts", "setup-opencode.mjs"), "--scope", "project", "--package", target],
      { cwd: root, env, encoding: "utf8" },
    );
    const text = await readFile(config, "utf8");
    assert.ok(text.includes(target));
    assert.ok(!text.includes(oldCheckout));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
