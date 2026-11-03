# OpenCode Fast Context

A working retrieval plugin for [OpenCode](https://opencode.ai/). It finds the files and line ranges that answer a code question with a bounded local search, then optionally ranks the candidates with a decision model (Jev or Clef) before returning compact citations.

Fast Context is the pattern where a coding agent delegates codebase research to a quick specialist instead of reading a pile of grep output itself. [Cognition's write-up](https://cognition.com/blog/swe-grep) describes Windsurf's version as a trained retrieval subagent with parallel search and tight tool limits. This project reproduces the workflow, not the trained model.

## Status

- The plugin and benchmark are implemented and tested (`npm test`, 14 tests).
- Live verification: OpenCode 2.2.5 loads the plugin and a DeepSeek session calls `fast_context_search`.
- Measured on a small pinned corpus: median search falls from 18.5s to 4.5s with Jev ranking, but retrieval quality is lower than stock OpenCode. See [BENCHMARK.md](BENCHMARK.md).
- Recommendation: use it explicitly while it is measured, not as a default replacement for search.

## Install

The package is not published to npm yet. Register the built directory as a local plugin in your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["file:///absolute/path/to/opencode-fast-context"]
}
```

OpenCode 2.x loads `dist/index.js`. Build before first use:

```bash
npm install
npm run build
```

OpenCode 1.x can use the legacy entry point `dist/legacy.js` from the same package.

## Configure a decision provider

Without a provider the tool returns deterministic lexical ranking (fast, lower quality). To rank with a decision model, set one provider:

```bash
export FAST_CONTEXT_PROVIDER=jev     # or clef
export TYPESAFE_API_KEY=...          # Jev
# or
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
```

Optional: `FAST_CONTEXT_PROVIDER=none` to force local ranking, or a plugin option `{ "provider": "jev", "model": "jev-latest", "deadlineMs": 10000 }` if your OpenCode version passes plugin options.

Clef defaults to `clef-flash` and is capped at 12 ranked candidates because Cloudflare's REST endpoint was slower per call in testing. Override with `model`.

## What a call does

The model calls:

```json
{ "query": "Where is the retry backoff computed?", "maxFiles": 5 }
```

The engine:

1. Tokenizes the question, ignoring prose filler and the repository's own name.
2. Runs local `rg` searches, weighted by how specific each term is in this repository.
3. Builds bounded windows around matches and scores them by definition lines, imports, comments, and path.
4. Sends up to 24 candidate snippets (12 for Clef) to the chosen decision model, one relevance question per candidate, in parallel.
5. Re-checks the selected files, validates line ranges and digests, and returns compact citations.

Tool output looks like:

```
status: complete
provider: jev:jev-1.14.0
files: 3/128 candidates
time: 4210ms (discovery 180ms, ranking 3900ms)

1. src/retry.ts:8-31  (decision 0.93, lexical 4.2)
    8: export function backoffForAttempt(attempt: number) {
    ...
```

If the provider fails or the deadline expires, the result is `fallback_required` or `partial` with a reason, and ordinary search remains available.

## Safety and limits

- Reads only inside the worktree; symlinks that resolve outside it are skipped.
- Excludes `.env*`, credential files, private keys, binaries, and common lock/binary extensions from candidates.
- Intermediate grep output and provider exchanges never reach the main conversation; only selected citations and short excerpts do.
- Snippets are sent to the configured provider, not to OpenCode. With `provider=none`, no source leaves the machine.
- Default budgets: 10s deadline, 4 waves, 8 concurrent operations, 24 ranked candidates, 10 files, 200 evidence lines.
- No persistent index, no trained model, no automatic tool interception.

## Benchmark

The corpus has 10 tasks over pinned [ripgrep](https://github.com/BurntSushi/ripgrep) and [OpenCode](https://github.com/sst/opencode) checkouts, split into 6 tuning and 4 held-out tasks. Each run compares against stock OpenCode with DeepSeek:

| Arm (tuning, n=6) | Median | p95 | Top-1 | Recall@5 |
| --- | ---: | ---: | ---: | ---: |
| Stock OpenCode + DeepSeek | 18.5s | 34.5s | 100% | 1.00 |
| Local ranking, no provider | 0.75s | 1.6s | 33% | 0.33 |
| Jev ranking | 4.5s | 5.9s | 33% | 0.83 |
| Clef ranking | 5.2s | 6.6s | 33% | 0.67 |

Held-out results are worse: Jev keeps 54% lower median time but recall@5 falls from 1.00 to 0.50, and neither decision model identifies the two absent-answer questions. Details, method, and limitations are in [BENCHMARK.md](BENCHMARK.md).

## Development

```bash
npm test                      # unit and integration tests
npm run typecheck
npm run build

# corpus checks and benchmarks
node bench/run.ts --arm jev --split tuning
node bench/b0.ts --split tuning
node bench/compare.ts bench/runs/b0-tuning bench/runs/jev-tuning
```

Benchmark checkouts live in `bench/repos/` and raw runs in `bench/runs/`; both are gitignored. The corpus is `bench/corpus/tasks.json`.

## Project documents

- [BENCHMARK.md](BENCHMARK.md): method, results, and what they mean.
- [RESEARCH.md](RESEARCH.md): background research and feasibility.
- [OpenSpec changes](openspec/changes): the benchmark and retrieval specifications.
