# Tasks

## 1. Corpus and baseline

- [x] 1.1 Add task and run-manifest schemas with pinned repository revisions, hidden reviewed ranges, and split membership; verify malformed revisions and leaked labels are rejected by fixture tests.
  - Implemented in `bench/corpus.ts`; validation rejects missing files, out-of-range labels, and a checkout whose HEAD differs from the pinned commit (fixture test included).
- [ ] 1.2 Prepare 24 tasks across pinned OpenCode and ripgrep checkouts, reserve eight held-out tasks, and document source review for every label; verify each range exists at its pinned revision.
  - Delivered a smaller corpus after review: 10 tasks (6 tuning, 4 held-out, 2 absent-answer) over pinned ripgrep and OpenCode commits. Expanding to 24 is still open.
- [x] 1.3 Implement a fresh-session stock OpenCode runner with plugin disabled and explicit DeepSeek model/provider recording; verify one recorded baseline transcript uses normal tools and contains no candidate labels.
  - `bench/b0.ts` runs `opencode run --standalone --format json` per task in an isolated home with `plugins: []`, records the effective config hash and plugin list, validates every citation, and treats non-zero exit, timeout, or malformed output as a failure.
- [x] 1.4 Document reproducible baseline commands and local transcript exclusions; verify a dry run writes a complete manifest without making provider calls.
  - Commands are in `BENCHMARK.md`; `bench/repos/` and `bench/runs/` are gitignored.

## 2. Measurement and comparison

- [x] 2.1 Implement metric calculation and failure accounting; verify hand-scored fixtures for precision, recall, line coverage, no-answer cases, timeout, and unavailable usage.
  - `bench/metrics.ts` covers top-1, fixed-denominator precision@5, recall@5, line coverage, absent-answer, completion, invalid citations, and context size. Unit tests cover denominator, failure, malformed answer, and absent-answer cases.
- [ ] 2.2 Add repeated randomized paired scheduling and startup/cache annotations; verify a deterministic seed reproduces run order and every failed run remains in output.
  - `--repeat` and `--concurrency` exist. Randomised paired scheduling and seeding are not implemented; runs are executed sequentially in corpus order.
- [x] 2.3 Add B1, Jev, and Clef arms using the shared retrieval engine when available; verify manifests hold the main DeepSeek model and task/output budgets constant across comparisons.
  - All three arms share `searchRepository`; manifests record the provider model and corpus.
- [x] 2.4 Generate per-task and aggregate reports with variability, fallback totals, and target comparisons; verify a synthetic slower or lower-recall candidate is reported as missing targets.
  - `bench/report.ts` and `bench/compare.ts` produce both views.

## 3. Integration evidence

- [x] 3.1 Run B0 before candidate tuning and preserve reviewed manifests and targets; verify the baseline report identifies exact versions and contains no secrets.
  - B0 was run on both splits before the final comparison; reports are in `bench/runs/` locally and summarised in `BENCHMARK.md`.
- [x] 3.2 Run candidate comparisons on frozen held-out tasks and publish reviewed reports; verify every reported figure traces to raw run records and distinguish targets from measured results.
  - Held-out runs were executed after the implementation was frozen; `BENCHMARK.md` separates targets from results and names the limitations.
