# Proposal

## Why

The current four-task validation split and one run per arm show a speed difference, but they cannot establish retrieval parity. The aggregate result also hides whether failures come from discovery, ranking, abstention, or range extraction. We need a registered hill-climb that diagnoses those stages and a final experiment whose tasks cannot influence implementation decisions.

## What changes

- Add stage-level benchmark observations for candidate coverage, conditional ranking, abstention, and line-range extraction.
- Add a registered development hill-climb with causal ablations and explicit promotion rules.
- Build task fixtures from public issue, pull request, commit, test, and source evidence.
- Add a hidden confirmatory corpus sized by a paired non-inferiority power calculation.
- Require append-only run records, frozen manifests, randomized paired repetitions, confidence intervals, and independent label review.
- Compare stock OpenCode, the selected fast-context arm, and the selected arm with fallback.

## Capabilities

### New capabilities

- `retrieval-experiment`: a diagnostic hill-climb and pre-registered confirmatory experiment built on the pilot benchmark.

## Impact

Adds corpus provenance, qrels, stage traces, run manifests, statistical analysis, and CI verification to the benchmark. Retrieval implementation changes remain separate and enter the experiment only as registered variants. Existing validation tasks become development evidence.

