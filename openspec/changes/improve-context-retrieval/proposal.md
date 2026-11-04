# Proposal

## Why

End-user feedback reports that one 872 ms call returned three useful design documents and two distractors. The README and harness description frame the tool as answering a question, while its useful job is selecting relevant files and ranges for an agent's context. Repeated experimental warnings distract from that job. The user also needs proof that the OpenCode agent receives the description and schema.

This report is one session, not a labelled benchmark. Its filenames and reported scores inform the regression design; they do not establish the cause of the distractors.

## What changes

- Describe Fast Context as retrieving relevant repository files and excerpts into agent context, throughout README, harness guidance, tool schema descriptions, and Jev relevance instructions.
- Remove experimental and quality-parity warnings from the normal README path and agent-facing instructions. Keep measured results and methodology in BENCHMARK.md without adding unsupported claims.
- Publish a concise agent contract and verify the actual description, input schema, and guidance delivered by OpenCode in an isolated runtime session.
- Guide the caller to use concrete domain names and identifiers, read retrieved ranges, and obtain current status or absence evidence using directory listings and version-control checks.
- Diagnose and reduce loosely related results with a mixed code/design-document regression corpus, including fewer-than-requested results when appropriate.

## Capabilities

### New capabilities

- `context-retrieval-contract`: the agent-visible retrieval contract and its runtime verification.
- `retrieval-relevance-regressions`: mixed-document relevance tests and a measured policy for omitting distractors.

## Impact

Targets the next GitHub release after 0.1.0. Keep the existing tool name, query/maxFiles input shape, status values, and suggest/off setting. No installation or publication is part of this proposal. No encrypted-file reader, project-status tool, or background provider calls are added.

