# Design

## Context

No implementation exists. OpenCode documents TypeScript plugins and custom tools through `@opencode-ai/plugin`. Jev and Clef take state and typed questions. They can select supplied candidates; application code must provide those candidates and execute searches.

Sources checked 2026-11-03:

- https://opencode.ai/docs/plugins/
- https://opencode.ai/docs/custom-tools/
- https://docs.typesafe.ai/llms.txt
- https://developers.cloudflare.com/workers-ai/models/clef/
- https://developers.cloudflare.com/changelog/post/2026-10-01-clef-workers-ai/

## Goals / Non-Goals

Keep a retrieval engine callable outside OpenCode so the benchmark uses the same engine. Start with explicit invocation and no persistent index. Automatic routing and native child-agent sessions are outside this proposal. Do not promise arbitrary natural-language query generation from decision models.

## Decisions

Publish one tool named `fast_context_search`, with `query` and optional `maxFiles`. Return a versioned object serialized as JSON if the pinned OpenCode tool API requires text. Include status, verified results, truncation, timings, provider identity, and fallback reason. A result contains a relative path, inclusive 1-based ranges, and a content digest for freshness checks. Status is one of complete, partial, no_match, fallback_required, cancelled. `no_match` describes searched evidence, not proof that the repository lacks an answer.

Keep intermediate grep output and provider exchanges out of the main conversation. Format final evidence as compact `path:start-end` citations with bounded excerpts. Use OpenCode's ordinary tool progress display; a custom status line is deferred until the pinned API proves it possible without extra transcript output.

Divide implementation into an OpenCode adapter, a repository search engine, and decision-provider adapters. The engine owns candidate ids, budgets, and execution. Adapters normalize typed judgments and preserve usage availability. Jev and Clef use equivalent score rubrics over the same bounded query-and-snippet state. Do not assume their scores or confidence values have identical calibration. Rank by relevance score with stable path/range tie breaks. Provider-specific thresholds must come from tuning data.

Generate a file manifest and tokenize the query deterministically, preserving identifiers and path fragments. Run literal text and filename searches concurrently, then create bounded windows around matches. Rank lexical candidates before semantic scoring so provider state remains bounded. A second wave can search identifiers extracted from selected source windows. Decision models select existing candidate ids or bounded action ids; they never supply executable shell commands. This gives an initial retrieval loop without depending on generative planning. Semantic paraphrases without lexical overlap are a measured weakness, and later expansion needs a separate proposal if warranted.

Initial adjustable limits: four retrieval waves, eight concurrent local operations, 128 candidate windows, 64 lines per window, 10 returned files, 200 returned lines, and a 10-second total deadline. Request state is byte/token bounded below provider limits, with truncation explicit. Batch independent scoring questions within each provider's documented limits. Limits are starting settings, not speed claims. Use subprocess argument arrays and terminate children on deadline or cancellation. No hidden retry after the total budget expires.

Resolve paths and symlinks against the worktree. Respect ignore rules and OpenCode access restrictions, exclude credential/config secrets and binary files, and reject outside-root reads. The tool must request the pinned SDK's applicable permission before reading/sending source. Confirm that permission path with an integration test before release; direct filesystem tools must not bypass host restrictions. Source sent to the chosen provider is documented during setup. Repository content is data, never tool instructions. Logs omit source and credentials by default.

Validate ranges against current bytes before returning them, merge overlaps, and cap final evidence. On provider failure or uncertain results, return a typed fallback indication promptly; the main agent can continue its existing tools. Preserve any valid partial evidence without presenting it as a complete answer. Do not silently launch another paid provider or modify built-in tools.

## Risks / Trade-offs

Candidate recall bounds total recall. Compare B1 with both decision providers to identify that loss. Scoring state can dominate latency. Bound it and measure request time separately. Host APIs may differ by version. Pin the SDK and OpenCode version together and test registration, permissions, and cancellation. Confidence cannot prove relevance. Use reviewed benchmark labels.

## Migration plan

Land B0 baseline support first. Add the engine with deterministic ranking, then Jev and Clef adapters, then OpenCode registration. Keep the plugin opt-in until held-out measurements are published. Rollback is removal of the plugin configuration entry.
