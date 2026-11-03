# H1 provider-budget result

Run 2026-11-03 on the existing tuning split (6 answer-present tasks, one run each), stage `climb3`, Jev arm. This is a preliminary H1 read: it is not the registered 80-task development corpus and has no absent tasks.

Protocol: `EXPERIMENT_PROTOCOL.md` (hash in `bench/experiment/manifest.json`). Implementation commit is recorded in each run manifest. Validation tasks were not used.

| Variant | Provider budget | Median | p95 | Discovery hit | Rank hit given discovery | Recall@5 | Line coverage | Partial runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| H1-24 | 24 | 4,837 ms | 5,858 ms | 6/6 | 6/6 | 1.00 | 0.81 | 0 |
| H1-48 | 48 | 8,538 ms | 9,817 ms | 6/6 | 6/6 | 1.00 | 0.81 | 0 |
| H1-64 | 64 | 10,007 ms | 10,011 ms | 6/6 | 6/6 | 1.00 | 0.81 | 5 |

## Decision

H1 does not promote. Discovery already succeeds for every task at 24 files, so extra provider calls buy no measured quality. Budget 48 raises median latency by 77%; budget 64 hits the 10-second deadline and returns partial results. Keep the 24-file budget for the next generation.

## Limits

- Six tuning tasks, one repetition, no absent tasks.
- Candidate pools are capped at 200 files in diagnostics, which was reached on three tasks.
- Provider latency dominates; this measures public Jev calls from one machine.
- The protocol's repository-stratified five-fold development evaluation is still required before H1 is treated as settled.
