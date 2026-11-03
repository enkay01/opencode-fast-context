# Design

## Context

The repository contains research and OpenSpec configuration, with no plugin or benchmark code. See proposal.md for motivation. The user has Jev and Clef and wants comparisons against DeepSeek in OpenCode, excluding Morph.

## Goals / Non-Goals

Measure retrieval separately from downstream coding success. Do not infer task correctness from edited files alone or treat provider confidence as ground truth. No new paid service is required.

## Decisions

Use four experiment arms: B0 is DeepSeek with stock OpenCode tools; B1 uses deterministic candidate generation without semantic ranking; J uses the same candidates ranked by Jev; C uses them ranked by Clef. Pin every selected DeepSeek model/provider as a separate baseline. Hold the main model, task prompt, repository commit, and output budget constant within each paired comparison. B0 retains its normal search policy and tools, including any normal exploration delegation. Record its effective configuration without modifying it to make the plugin look better.

Use 24 source-reviewed localization tasks across two pinned public repositories, initially OpenCode and ripgrep. Include symbol lookup, behavior lookup, cross-file flow, and absent-answer questions. Reserve eight tasks for held-out evaluation. Label useful evidence files and line ranges at the pinned commit, including explanatory files that a fix might never edit. Keep labels hidden from agents. Review labels before evaluation and freeze them; do not use Jev or Clef as the sole judge. If reproducible checkout or licensing prevents a fixture, record the replacement and freeze it before any measured runs.

Run five repetitions per task and arm in fresh sessions, with randomized arm order and identical wall-clock limits. Separate first-process runs from reused-process runs; do not call either an OS cold-cache test. Record candidate cache and provider cache state, with unknown states explicit. The measurement interval starts at task submission and ends at a validated localization answer. Failed or timed-out runs remain in the denominator. A later end-to-end coding experiment is separate.

Record monotonic elapsed time, p50/p95, file precision@5, relevant-file recall@5, line coverage, no-answer accuracy, context bytes, reported tokens, model round trips, and failure/fallback rate. Distinguish missing provider usage from zero. Report per-task paired differences, variability, and corpus macro averages. Fallback time includes the failed attempt plus normal search. Never count fallback as successful plugin retrieval.

Initial engineering target, not an observed result: at least 25% lower median total localization time, no more than two percentage points lower macro recall@5, no worse p95, and at least 95% valid completion. Report uncertainty and task-level regressions; a small corpus cannot establish general parity. Run the baseline first, then freeze targets before candidate tuning. Report failures honestly even if targets are missed.

## Risks / Trade-offs

Provider latency varies. Interleave paired runs and retain raw timings. Candidate coverage limits ranking quality. B1 distinguishes discovery failures from ranking failures. Repositories may occur in model training. Use held-out tasks and avoid claims about unseen repositories.

## Migration plan

Land the corpus schema and B0 runner first. Add candidate arms after the plugin contract exists. Keep local transcripts ignored and publish only reviewed reports. No benchmark calls occur as part of proposal authoring.
