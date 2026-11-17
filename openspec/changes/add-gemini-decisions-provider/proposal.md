# Proposal

## Why

Fast Context currently requires TypeSafe Jev for decision ranking. Google's Gemini Decisions API offers the same closed-set judgment primitives and gives users a second provider option, but its latency, relevance scores, and data terms need to be evaluated on this retrieval workload before any performance claim.

The first Gemini TUI self-test exposed a setup gap: a verified, stored Gemini key can coexist with no active provider, so `fast_context_search` returns `fallback_required` before discovery or any Gemini request. The existing handler-level tests do not exercise the TUI command, RPC, persisted selection, and tool together. Users also cannot see the active Fast Context provider or its health in the session sidebar.

## What Changes

- Add an in-TUI provider picker and separate onboarding for Jev and Gemini through one plugin entrypoint. Persist the choice and switch without restart; keep `decisionProvider` only as an optional initial choice.
- Make provider onboarding an observable state transition: selecting or directly setting up a provider must verify its credential, persist the active choice, and confirm that status and subsequent searches use that same choice. A cancelled or failed switch keeps the previous active provider. Read the authoritative selection at search time so another server instance or reload cannot use a stale setup snapshot.
- Show the selected Fast Context provider and connection state in the TUI sidebar. Distinguish a stored or environment key from a verified connection, and surface setup, RPC, credential, and last request errors without displaying key material.
- Add a Gemini Decision 1 adapter for relevance probabilities and optional directory choice, with bounded requests, validated answers, token usage, cancellation, and typed fallback on failure.
- Resolve and manage `GEMINI_API_KEY` separately from the existing TypeSafe key, including interactive masked credential entry, provider-specific verification, status, replacement, and revocation. Document which service receives repository excerpts and its free/paid data treatment.
- Repair the existing benchmark runner's outdated provider wiring, compare Jev and Gemini on paired tasks, and calibrate Gemini's abstention threshold using development data before evaluating an untouched set. Publish measured latency, quality, failure, token, and cost results without claiming parity from Google's service-level figures.
- Gate the self-test wizard and release validation on a real TUI command-to-RPC-to-search round trip, including restart and switch behavior. Record a safe failure state rather than declaring setup complete when a credential was saved but no provider became active.

## Capabilities

### New Capabilities

- `decision-provider-selection`: Explicit provider choice, provider-specific credentials and outbound data disclosure, and equivalent bounded search behavior with Gemini Decisions.

### Modified Capabilities

None. The project has no archived capability specs yet; related in-flight change specs remain independent.

## Impact

- Plugin option parsing and provider resolution (`src/config.ts`), provider/result types and the Gemini adapter (`src/providers/`, `src/types.ts`), and the authentication bridge, integration credentials, TUI commands, and sidebar slot (`src/index.ts`, `src/tool.ts`, `src/credentials.ts`, `src/auth-*`, `src/tui.tsx`).
- Ranking threshold configuration in the search engine; provider-specific and real-host TUI transition tests, self-test wizard, README/security guidance, and benchmark tooling and report (`scripts/`, `test/`, `bench/`, `BENCHMARK.md`).
- External dependency: Gemini Developer API `v1beta/decisions` with `gemini-decision-1`. No new runtime SDK is required if the documented REST contract is used. Existing Jev credentials remain intact; the user chooses the active provider in the TUI.
