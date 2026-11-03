import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateCorpus, type Corpus } from "../bench/corpus.ts";

async function makeRepo(): Promise<{ root: string; commit: string; cleanup(): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "fast-context-corpus-"));
  const repo = join(root, "repo");
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "a.ts"), "one\ntwo\nthree\n");
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args],
      { cwd: repo, encoding: "utf8" },
    ).trim();
  git("init", "-q");
  git("add", ".");
  git("commit", "-q", "-m", "fixture");
  return { root, commit: git("rev-parse", "HEAD"), cleanup: () => rm(root, { recursive: true, force: true }) };
}

function corpusFor(commit: string): Corpus {
  return {
    version: 1,
    repos: {
      fixture: { url: "https://example.invalid/fixture", commit, path: "repo" },
    },
    tasks: [
      {
        id: "fixture-task",
        repo: "fixture",
        split: "validation",
        question: "where",
        labels: [{ path: "a.ts", ranges: [{ start: 1, end: 2 }] }],
      },
    ],
  };
}

test("accepts a checkout at the pinned commit", async () => {
  const fixture = await makeRepo();
  try {
    assert.deepEqual(await validateCorpus(fixture.root, corpusFor(fixture.commit)), []);
  } finally {
    await fixture.cleanup();
  }
});

test("rejects a checkout whose HEAD differs from the pinned commit", async () => {
  const fixture = await makeRepo();
  try {
    const errors = await validateCorpus(fixture.root, corpusFor("0".repeat(40)));
    assert.ok(errors.some((error) => /does not match pinned/.test(error)), errors.join("; "));
  } finally {
    await fixture.cleanup();
  }
});

test("rejects a label range outside the file", async () => {
  const fixture = await makeRepo();
  try {
    const corpus = corpusFor(fixture.commit);
    corpus.tasks[0]!.labels = [{ path: "a.ts", ranges: [{ start: 1, end: 99 }] }];
    const errors = await validateCorpus(fixture.root, corpus);
    assert.ok(errors.some((error) => /outside 1\.\./.test(error)), errors.join("; "));
  } finally {
    await fixture.cleanup();
  }
});
