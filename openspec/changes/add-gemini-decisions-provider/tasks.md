# Tasks

## 1. Provider option and transport

- [x] 1.1 Add provider identity types, an optional initial selection, storage-backed TUI selection, and rejection of unknown values before outbound work; verify handler-level no-selection and switching tests pass.
- [x] 1.2 Implement `gemini-decision-1` REST scoring with the fixed Google endpoint, `noul` criteria translation, finite response validation, deadlines, cancellation, partial results, and usage aggregation; verify request/response/error fixture tests pass.
- [x] 1.3 Implement optional directory choice with bounded stable option IDs and valid-result mapping; verify tests cover unknown IDs, long paths, and the existing opt-in gate.
- [ ] 1.4 Wire Gemini into search execution with a separately configured relevance threshold while retaining Jev's 0.15 and result version; verify ranking, abstention, and fallback tests with both providers.
- [ ] 1.5 Make persisted selection authoritative on every status and new search, snapshot it for one run, and fail safely on storage errors; verify restart, two server instances, selection changes during a search, and duplicate-entry diagnostics without using a provider from a stale closure.

## 2. Credentials and outbound disclosure

- [x] 2.1 Register a separate Gemini OpenCode credential integration and resolve `GEMINI_API_KEY` before its stored key without reading TypeSafe credentials; verify precedence and cross-provider isolation tests pass.
- [x] 2.2 Extend auth RPC and masked TUI flow for Gemini's provider-labeled prompt and a bounded source-free Decisions validation call; verify rejected, accepted, cancelled, and headless flows in handler-level tests.
- [x] 2.3 Scope status, replacement, revocation, and HTTP 401/403 cleanup to the selected provider, preserving both environment keys and the other provider's stored records; verify lifecycle tests pass.
- [x] 2.4 Document provider switching, both credential paths, the Google source recipient, free/paid data-use terms, rollback, and error guidance in README/SECURITY; verify setup steps and displayed prompt text match the documentation.
- [ ] 2.5 Make provider picker and targeted commands such as `/fast-context auth gemini` finish with a verified credential, persisted active provider, and server status readback before showing success. On cancellation or validation/persistence error, retain the previous provider and report a partial key save accurately; verify every transition and provider isolation.
- [ ] 2.6 Add a non-secret server status/event contract and an additive `sidebar.footer` indicator for selected provider, credential source, verification time, last failure, and RPC unavailable. Keep the detailed status dialog consistent with the sidebar and tool; verify no key, source excerpt, or raw provider body reaches UI status or logs.

## 3. Paired benchmark and calibration

- [x] 3.1 Repair the stale `bench/run.ts` provider types/resolution call and add a Gemini arm with matched corpus, limits, output, and redacted raw records; verify the runner's deterministic and schema checks succeed without live keys.
- [x] 3.2 Add per-request latency, call count, response usage, HTTP error/429, estimated paid cost, and full-search status to paired runs; verify a fixture report regenerates all fields and keeps failures in denominators.
- [ ] 3.3 Run randomized repeated Jev/Gemini trials on development tasks with the same pinned repositories; calibrate Gemini's threshold on held-back development folds, freeze prompt/threshold hashes, and verify the recorded run manifest identifies every variant and result.
- [ ] 3.4 Compare one-request-per-snippet with Gemini multiple-questions-per-request as a separately named variant on development tasks; verify the report covers quality, latency, tokens, quota errors, and candidate-ID mapping for both layouts.
- [ ] 3.5 Evaluate the frozen candidate against genuinely untouched tasks under `EXPERIMENT_PROTOCOL.md`, publish paired recall/abstention/completion and median/p95 end-to-end latency with uncertainty and limits in `BENCHMARK.md`; verify the report regenerates from raw records and does not call old validation tasks fresh evidence.

## 4. Integration gate

- [ ] 4.1 Run typecheck, tests, release verification, and OpenCode smoke flows for unselected onboarding, Gemini selection, switching to Jev and back, missing keys, and provider failure; verify all commands succeed and no credential or unredacted source appears in output.
- [ ] 4.2 Add a real OpenCode TUI integration gate from slash command through RPC, storage, and `fast_context_search`: cover `/fast-context auth gemini` from an unselected start, picker selection, cancel, failed storage, restart, second instance, revoke, 401/403, 429, timeout, and status/sidebar updates. Keep mocked handler tests but do not count them as proof of this host path.
- [ ] 4.3 Update the self-test wizard so completion requires server status showing active Gemini and one search reporting Gemini, with actionable diagnostics on mismatch. Review a post-auth TUI recording for secrets, attach the safe result to the PR, verify the attachment, and remove local capture artifacts as described in the recording plan.
