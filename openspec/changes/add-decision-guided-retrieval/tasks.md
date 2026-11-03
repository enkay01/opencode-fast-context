# Tasks

## 1. Engine and evidence

- [ ] 1.1 Pin TypeScript tooling and OpenCode SDK/runtime versions and define versioned input/output contracts; verify type checking and contract fixtures for every status.
- [ ] 1.2 Implement ignored-file-aware candidate discovery with literal search and bounded identifier-following waves; verify known-symbol and cross-file fixtures and document lexical coverage limits.
- [ ] 1.3 Enforce realpath containment, host permissions, secret exclusions, subprocess deadlines, and cancellation; verify outside-root symlink, denied-read, secret-file, and hung-process cases.
- [ ] 1.4 Implement stable ranking, range validation, digests, overlap merging, and output caps; verify stale-file and oversized-result fixtures and document evidence semantics.

## 2. Decision providers

- [ ] 2.1 Implement Jev adapter using its current documented typed-decision interface; verify recorded non-sensitive fixtures for relevance scores, refusal, malformed response, timeout, and missing usage.
- [ ] 2.2 Implement Clef adapter with equivalent state and rubrics and explicit model selection; verify equivalent contract fixtures without assuming provider score calibration matches Jev.
- [ ] 2.3 Add batched scoring within provider limits, bounded retries, and explicit partial/fallback results; verify request caps and that no requests start after cancellation or deadline.
- [ ] 2.4 Document provider setup, source transmission, configuration limits, and logging behavior; verify examples contain no credentials and deterministic mode works without a provider.

## 3. OpenCode integration

- [ ] 3.1 Register fast_context_search through the pinned custom-tool API; verify a real OpenCode session can invoke it and read checked paths/ranges.
- [ ] 3.1a Keep intermediate search output outside the main conversation and format final citations with bounded excerpts; verify the tool response contains no raw grep transcript.
- [ ] 3.2 Integrate applicable host permission and cancellation mechanisms; verify a denied directory never reaches the provider and cancellation ends outstanding work.
- [ ] 3.3 Document opt-in installation and removal; verify built-in search remains usable after provider failure and after removing the plugin.
- [ ] 3.4 Connect the benchmark's B1/J/C arms and publish held-out comparisons; verify fallback timing includes the failed attempt and each model's actual identity is recorded.
