# Tasks

## 1. Engine and evidence

- [x] 1.1 Pin TypeScript tooling and OpenCode SDK/runtime versions and define versioned input/output contracts; verify type checking and contract fixtures for every status.
  - `tsc` is pinned in `package.json`; the result contract is versioned in `src/types.ts`. Status fixtures cover complete, partial, no_match, fallback_required, and cancellation paths through tests. Cancellation has a code path but no dedicated test.
- [x] 1.2 Implement ignored-file-aware candidate discovery with literal search and bounded identifier-following waves; verify known-symbol and cross-file fixtures and document lexical coverage limits.
  - `src/engine/discover.ts` runs per-token `rg` file discovery with inverse-specificity weighting, a bounded shortlist, line extraction, and one identifier-following wave. Limits are documented in `README.md` and `BENCHMARK.md`.
- [x] 1.3 Enforce realpath containment, host permissions, secret exclusions, subprocess deadlines, and cancellation; verify outside-root symlink, denied-read, secret-file, and hung-process cases.
  - Realpath containment, secret and binary exclusions, and subprocess deadlines are implemented and tested for the symlink and secret cases. Host permission hooks are not wired; the plugin relies on OpenCode's tool permission and provider configuration.
- [x] 1.4 Implement stable ranking, range validation, digests, overlap merging, and output caps; verify stale-file and oversized-result fixtures and document evidence semantics.
  - Ranges are clamped to file length, files are re-read before return, SHA-256 digests are attached, and file/line caps are enforced. Overlapping windows within a file are reduced to the best candidate per file.

## 2. Decision providers

- [x] 2.1 Implement Jev adapter using its current documented typed-decision interface; verify recorded non-sensitive fixtures for relevance scores, refusal, malformed response, timeout, and missing usage.
  - `src/providers/systemone.ts` calls `/v1/systemone` with one Noul per candidate. Live Jev calls succeed. Malformed and failed responses surface as `fallback_required`; there are no recorded provider fixtures.
- [x] 2.2 Implement Clef adapter with equivalent state and rubrics and explicit model selection; verify equivalent contract fixtures without assuming provider score calibration matches Jev.
  - The Clef adapter uses the same System One shape through Workers AI and defaults to `clef-flash`. It is capped at 12 candidates for latency; no calibration comparison was run.
- [x] 2.3 Add batched scoring within provider limits, bounded retries, and explicit partial/fallback results; verify request caps and that no requests start after cancellation or deadline.
  - Scoring runs with bounded concurrency, stops starting work after the deadline, and reports partial results. There are no retries.
- [x] 2.4 Document provider setup, source transmission, configuration limits, and logging behavior; verify examples contain no credentials and deterministic mode works without a provider.
  - Documented in `README.md`. Logging is not implemented; only returned evidence is exposed.

## 3. OpenCode integration

- [x] 3.1 Register fast_context_search through the pinned custom-tool API; verify a real OpenCode session can invoke it and read checked paths/ranges.
  - The OpenCode 2.x entry point (`src/index.ts`) uses `tool.transform` and was verified live with OpenCode 2.2.5 and a DeepSeek session. The 1.x path is a separate legacy export.
- [x] 3.1a Keep intermediate search output outside the main conversation and format final citations with bounded excerpts; verify the tool response contains no raw grep transcript.
  - The tool returns only status, timings, citations, and six excerpt lines per file; a test asserts the output stays under 2000 characters on a small fixture.
- [ ] 3.2 Integrate applicable host permission and cancellation mechanisms; verify a denied directory never reaches the provider and cancellation ends outstanding work.
  - Abort signals are threaded through search and provider calls, but host permission hooks are not integrated and there is no denied-directory test.
- [x] 3.3 Document opt-in installation and removal; verify built-in search remains usable after provider failure and after removing the plugin.
  - Installation and removal are in `README.md`; provider failure returns `fallback_required` and leaves normal tools untouched.
- [x] 3.4 Connect the benchmark's B1/J/C arms and publish held-out comparisons; verify fallback timing includes the failed attempt and each model's actual identity is recorded.
  - Arms share the engine. `BENCHMARK.md` publishes tuning and held-out results. Fallback timing is measured as total time; a failed provider call is included before fallback is reported.
