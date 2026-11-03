# Proposal

## Why

Test whether parallel local discovery and fast semantic decisions find useful code sooner than DeepSeek's normal OpenCode searches. Jev and Clef can rank known candidates through typed decisions, while application code controls repository access and execution.

## What Changes

- Add an explicit `fast_context_search` OpenCode tool returning verified paths and line ranges.
- Generate candidates locally, then rank them through interchangeable Jev and Clef adapters.
- Bound parallel work and output; support cancellation and clear fallback to ordinary search.
- Keep intermediate search output out of the main conversation and return compact source citations.
- Compare each provider independently using `benchmark-deepseek-search` before choosing defaults.

## Capabilities

### New Capabilities

- `fast-context-retrieval`: Bounded, evidence-based repository localization with configurable decision providers.

### Modified Capabilities

None.

## Impact

Adds a TypeScript plugin, local retrieval engine, and provider adapters when implemented. Uses OpenCode's documented custom-tool extension. No requirement for a native OpenCode child session, persistent index, model training, automatic interception, or Morph account. Benchmark baseline should land before tuning this implementation.

This change replaces the overlapping `fast-context-retrieval` proposal. It keeps the explicit tool and evidence contract while carrying forward that proposal's compact citation and transcript requirements. A custom progress line, automatic interception, and a five-second deadline need separate proof against the pinned OpenCode API and measured workloads.
