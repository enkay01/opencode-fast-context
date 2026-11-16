# Proposal

## Why

Fast Context currently requires TypeSafe Jev for decision ranking. Google's Gemini Decisions API offers the same closed-set judgment primitives and gives users a second provider option, but its latency, relevance scores, and data terms need to be evaluated on this retrieval workload before any performance claim.

## What Changes

- Add an in-TUI provider picker and separate onboarding for Jev and Gemini through one plugin entrypoint. Persist the choice and switch without restart; keep `decisionProvider` only as an optional initial choice.
- Add a Gemini Decision 1 adapter for relevance probabilities and optional directory choice, with bounded requests, validated answers, token usage, cancellation, and typed fallback on failure.
- Resolve and manage `GEMINI_API_KEY` separately from the existing TypeSafe key, including interactive masked credential entry, provider-specific verification, status, replacement, and revocation. Document which service receives repository excerpts and its free/paid data treatment.
- Repair the existing benchmark runner's outdated provider wiring, compare Jev and Gemini on paired tasks, and calibrate Gemini's abstention threshold using development data before evaluating an untouched set. Publish measured latency, quality, failure, token, and cost results without claiming parity from Google's service-level figures.

## Capabilities

### New Capabilities

- `decision-provider-selection`: Explicit provider choice, provider-specific credentials and outbound data disclosure, and equivalent bounded search behavior with Gemini Decisions.

### Modified Capabilities

None. The project has no archived capability specs yet; related in-flight change specs remain independent.

## Impact

- Plugin option parsing and provider resolution (`src/config.ts`), provider/result types and the Gemini adapter (`src/providers/`, `src/types.ts`), and the authentication bridge, integration credentials, and TUI commands (`src/index.ts`, `src/tool.ts`, `src/credentials.ts`, `src/auth-*`, `src/tui/`).
- Ranking threshold configuration in the search engine; provider-specific tests, README/security guidance, and benchmark tooling and report (`bench/`, `BENCHMARK.md`).
- External dependency: Gemini Developer API `v1beta/decisions` with `gemini-decision-1`. No new runtime SDK is required if the documented REST contract is used. Existing Jev credentials remain intact; the user chooses the active provider in the TUI.
