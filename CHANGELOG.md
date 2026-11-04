# Changelog

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
