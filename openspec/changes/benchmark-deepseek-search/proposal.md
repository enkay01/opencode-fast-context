# Proposal

## Why

We need a reproducible measurement of DeepSeek's normal OpenCode search before comparing the plugin. Morph is excluded, and access to Jev and Clef does not establish their retrieval quality.

## What Changes

- Add a pinned task corpus and baseline runner using unmodified OpenCode search behavior.
- Compare the baseline with deterministic candidate search, Jev-ranked search, and Clef-ranked search.
- Record quality, elapsed time, usage, failures, and fallback separately.
- Publish reproducible reports without credentials or private source text.

## Capabilities

### New Capabilities

- `retrieval-benchmark`: Repeatable comparisons of repository localization strategies.

### Modified Capabilities

None.

## Impact

Adds benchmark fixtures, a runner, and reporting tools when implemented. Requires an existing DeepSeek provider and explicitly configured Jev/Clef endpoints for candidate runs. Does not install Morph or run paid benchmarks during planning. Depends on no plugin implementation for the first baseline run.
