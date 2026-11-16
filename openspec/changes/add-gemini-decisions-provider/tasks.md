# Tasks

## 1. Provider option and transport

- [x] 1.1 Add `decisionProvider` parsing and provider identity types, preserving Jev as default and rejecting unknown values before any outbound request; verify configuration and no-request tests pass.
- [x] 1.2 Implement `gemini-decision-1` REST scoring with the fixed Google endpoint, `noul` criteria translation, finite response validation, deadlines, cancellation, partial results, and usage aggregation; verify request/response/error fixture tests pass.
- [x] 1.3 Implement optional directory choice with bounded stable option IDs and valid-result mapping; verify tests cover unknown IDs, long paths, and the existing opt-in gate.
- [ ] 1.4 Wire Gemini into search execution with a separately configured relevance threshold while retaining Jev's 0.15 and result version; verify ranking, abstention, and fallback tests with both providers.

## 2. Credentials and outbound disclosure

- [x] 2.1 Register a separate Gemini OpenCode credential integration and resolve `GEMINI_API_KEY` before its stored key without reading TypeSafe credentials; verify precedence and cross-provider isolation tests pass.
- [x] 2.2 Extend auth RPC and masked TUI flow for Gemini's provider-labeled prompt and a bounded source-free Decisions validation call; verify rejected, accepted, cancelled, and headless flows in integration tests.
- [x] 2.3 Scope status, replacement, revocation, and HTTP 401/403 cleanup to the selected provider, preserving both environment keys and the other provider's stored records; verify lifecycle tests pass.
- [x] 2.4 Document provider switching, both credential paths, the Google source recipient, free/paid data-use terms, rollback, and error guidance in README/SECURITY; verify setup steps and displayed prompt text match the documentation.

## 3. Paired benchmark and calibration

- [x] 3.1 Repair the stale `bench/run.ts` provider types/resolution call and add a Gemini arm with matched corpus, limits, output, and redacted raw records; verify the runner's deterministic and schema checks succeed without live keys.
- [x] 3.2 Add per-request latency, call count, response usage, HTTP error/429, estimated paid cost, and full-search status to paired runs; verify a fixture report regenerates all fields and keeps failures in denominators.
- [ ] 3.3 Run randomized repeated Jev/Gemini trials on development tasks with the same pinned repositories; calibrate Gemini's threshold on held-back development folds, freeze prompt/threshold hashes, and verify the recorded run manifest identifies every variant and result.
- [ ] 3.4 Compare one-request-per-snippet with Gemini multiple-questions-per-request as a separately named variant on development tasks; verify the report covers quality, latency, tokens, quota errors, and candidate-ID mapping for both layouts.
- [ ] 3.5 Evaluate the frozen candidate against genuinely untouched tasks under `EXPERIMENT_PROTOCOL.md`, publish paired recall/abstention/completion and median/p95 end-to-end latency with uncertainty and limits in `BENCHMARK.md`; verify the report regenerates from raw records and does not call old validation tasks fresh evidence.

## 4. Integration gate

- [ ] 4.1 Run typecheck, tests, release verification, and OpenCode smoke flows for Jev default, Gemini selection, switching back, missing keys, and provider failure; verify all commands succeed and no credential or unredacted source appears in output.
