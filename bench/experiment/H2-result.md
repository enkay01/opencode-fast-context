# H2 vocabulary-expansion result

Run 2026-11-03 on the existing tuning split (6 answer-present tasks, one run each), provider budget 24, Jev arm. Preliminary: this is not the registered 80-task development corpus.

Variants measured with the staged engine:

- `v0`: baseline tokenizer.
- `WIP-climb1`: stemming, code synonyms, hyphenated flags.
- `WIP-climb2`: concept grouping over stemmed terms.
- `climb3` (H1-24 run): multi-window and context enrichment, included for reference.

| Variant | Median | Discovery hit | Rank hit given discovery | Recall@5 | Line coverage | False abstention |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| v0 | 4,454 ms | 6/6 | 4/6 | 0.67 | 0.27 | 0/6 |
| WIP-climb1 | 4,431 ms | 6/6 | 4/6 | 0.67 | 0.32 | 0/6 |
| WIP-climb2 | 4,667 ms | 6/6 | 6/6 | 1.00 | 0.47 | 0/6 |
| climb3 | 4,837 ms | 6/6 | 6/6 | 1.00 | 0.81 | 0/6 |

## Decision

`WIP-climb2` promotes over `WIP-climb1`: the two failures were ranking failures after successful discovery, and concept grouping fixes both. Latency is within the 20% guardrail. `WIP-climb1` alone does not promote: recall is unchanged.

`climb3` is the current best candidate on range coverage, but H4 must still be evaluated against `WIP-climb2` as its registered parent.

Discovery is not the bottleneck on this split: the labelled file was in the pool for every task in every variant. H1's null result is consistent with that.

## Limits

- Six tuning tasks, one repetition, no absent tasks, one provider.
- Concepts and synonyms were developed against these tasks, so the gain is optimistic.
- The pool diagnostic is capped at 200 files, which was reached on some tasks.
