import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { loadCorpus, validateCorpus } from "../bench/corpus.ts";

const installed =
  existsSync("bench/repos/ripgrep/.git") && existsSync("bench/repos/opencode/.git");

test(
  "the pinned benchmark corpus matches installed checkouts",
  { skip: installed ? false : "benchmark checkouts are not installed (see BENCHMARK.md)" },
  async () => {
    const corpus = await loadCorpus(".");
    assert.deepEqual(await validateCorpus(".", corpus), []);
  },
);
