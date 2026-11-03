# Design

## Context

The reviewed benchmark at `1137754` has two answer-present and two absent validation tasks. Jev is faster than B0 on that set, but Recall@5 is 0.50 versus 1.00. One miss is a false abstention. Earlier work also found a discovery miss before provider ranking. Those are different mechanisms and need different measurements.

The full protocol is in `EXPERIMENT_PROTOCOL.md`.

## Goals

- Locate failures at the retrieval stage that caused them.
- Let small implementation changes compete through paired evidence.
- Preserve a final set that cannot influence implementation or thresholds.
- Make the success decision mechanical and reproducible.

## Non-goals

- Optimizing end-to-end code editing.
- Using model confidence as relevance ground truth.
- Claiming quality parity from the current validation split.
- Combining speed and quality in a weighted score.

## Decisions

The benchmark interface is a run record plus a frozen experiment manifest. Adapters for B0, local ranking, Jev, Clef, and fallback satisfy that interface. The interface contains all information needed to score a run and reproduce its configuration; provider-specific response parsing stays inside each adapter.

Instrument the retrieval implementation at four internal seams: post-discovery candidate pool, post-provider ranking, abstention decision, and final evidence extraction. Tests exercise the same run-record interface used by reports.

Use real public issue and fix history for task construction. Pin the repository before the fix, remove explicit path and symbol hints through a written transformation rule, and obtain two independent qrels. Use historical absence, not invented impossible questions, for no-answer tasks.

Run the climb on repository-stratified folds. Register each variant before measurement. Promote only on its targeted stage outcome with recall, specificity, completion, and latency guardrails.

Freeze the winner, thresholds, prompt, analysis script, and final corpus manifest before unsealing. The final joint claim requires Recall@5 non-inferiority within five percentage points and at least 25% latency reduction through registered confidence intervals.

## Risks

Accepted patches are incomplete relevance labels. Reviewers must add explanatory files and ranges that answer the issue but were unchanged by the patch.

Repositories can appear in model training data. The experiment uses real issues and pinned commits, then reports leave-one-repository-out results. It does not claim unseen-code performance from repository popularity alone.

Provider latency and model output vary. Randomized paired blocks, five repetitions, raw response retention, and a second-machine replication limit timing bias.

Repeated hill-climbing can overfit development tasks. Repository-stratified out-of-fold scoring and a single-use hidden final set limit that risk.

## Open questions

- Who will be the second qrel reviewer?
- Which public repositories satisfy the language, license, issue-quality, and size strata?
- Will the final raw provider responses be publishable under provider terms, or must they be stored as hashes plus derived decisions?

