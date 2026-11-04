# Changelog

## 0.1.1

Locator contract update.

- Tool description, schema descriptions, README opening, and invocation guidance now describe file and line retrieval, not question answering.
- Results include a `searched` scope: candidate windows sent to scoring, distinct files among them, and whether discovery hit its deadline. `no_match` no longer implies global absence.
- Jev relevance prompts ask whether a snippet is relevant context instead of whether it answers the query.
- Added generated `docs/agent-contract.md` with drift checking, and a real OpenCode 2 runtime contract capture against a local fake transport.
- No discovery scoring, selection threshold, or provider budget changes.

## 0.1.0

First experimental release for OpenCode 2.

- One OpenCode 2 plugin, ID `fast-context`, exposing `fast_context_search`.
- Climb3 local discovery: stemmed and synonym-expanded query terms, concept grouping, rarity weighting, up to three evidence windows per file.
- Jev ranking with a 24-file provider budget and a 10 second deadline.
- `autoInvoke: "suggest" | "off"`, default `suggest`. Guidance is session context only; it never executes retrieval or calls Jev.
- Outbound content filtering: sensitive filename exclusions, private-key rejection, and token redaction before provider requests.
- Credential-safe provider errors and a fixed TypeSafe HTTPS endpoint.
- Idempotent `setup:opencode`, release verification, and package-content checks.
- Benchmark evidence and limitations preserved in `BENCHMARK.md`.

### Known limitations

- Recall parity with stock OpenCode is not established. Fresh validation found 1 of 2 code files with Jev versus 2 of 2 with stock search.
- Automatic selection guidance cannot guarantee a tool call.
- Content filtering is defence in depth, not proof that source contains no secrets.
