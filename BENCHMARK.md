# Benchmark: decision-guided retrieval vs stock OpenCode

Measured 2026-11-03 on one Apple Silicon Mac, OpenCode 2.2.5, Node 26.5.0. These are single-run observations on a small corpus, not a general benchmark. Re-run before citing them elsewhere.

## Questions

1. Is a bounded retrieval tool faster than letting the coding agent search with normal tools?
2. Does Jev or Clef ranking recover enough quality to justify the extra latency?
3. Does it avoid inventing answers when the code does not exist?

## Setup

- **B0**: unmodified OpenCode with `opencode-go/deepseek-v4.1-flash`, normal tools, fresh `opencode run --standalone` process per task. Prompt asks only for `path:start-end` lines or `NO_ANSWER`.
- **B1**: this engine with deterministic lexical ranking, no provider.
- **J**: the same candidates ranked by Jev (`jev-1.14.0` via `api.typesafe.ai`).
- **C**: the same candidates ranked by `clef-flash` on Cloudflare Workers AI.

The plugin arms run in one process through the same `searchRepository` used by the plugin, with a 10s internal deadline. Wall time includes discovery, candidate reading, provider calls, and evidence validation. B0 wall time includes CLI and model startup, as a user experiences it.

Corpus: 10 tasks over pinned public checkouts.

- ripgrep `e89fff89ac9af12e8d4ce9d5fd07beb408ca730f` (tag 15.2.0)
- OpenCode `6d1c444b8c53da667b51ed45b0a7c0aca1174674`

Six tasks were used for tuning (5 code-location, 1 config-location). The held-out set has two code-location tasks and two absent-answer tasks. Labels were reviewed by reading the pinned source; they include files that explain behavior even when a fix might not edit them.

## Metrics

- **Top-1**: first returned file is a labelled file.
- **Precision@5**: labelled files among the first five / five.
- **Recall@5**: labelled files found in the first five / all labelled files.
- **Line coverage**: fraction of labelled lines covered by returned ranges for that file.
- **Absent correct**: returned no evidence for a task with no answer in the repository.

Raw records and transcripts are in the local `bench/runs/` directory and are intentionally not published; they contain excerpts of repository source.

## Results: tuning split (n=6, one run each)

| Arm | Median ms | p95 ms | Δ median vs B0 | Top-1 | Recall@5 | Line coverage | Valid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B0 stock OpenCode + DeepSeek | 18,516 | 34,544 | — | 100% | 1.00 | 0.87 | 100% |
| B1 local ranking | 750 | 1,575 | -96% | 33% | 0.33 | 0.17 | 100% |
| Jev ranking | 4,501 | 5,949 | -76% | 33% | 0.83 | 0.38 | 100% |
| Clef ranking | 5,212 | 6,592 | -72% | 33% | 0.67 | 0.23 | 100% |

## Results: held-out split (n=4: 2 code, 2 absent)

| Arm | Median ms | p95 ms | Δ median vs B0 | Code top-1 | Code recall@5 | Absent correct | Valid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B0 stock OpenCode + DeepSeek | 11,199 | 19,588 | — | 100% | 1.00 | 2/2 | 100% |
| B1 local ranking | 1,024 | 2,292 | -91% | 50% | 0.50 | 0/2 | 100% |
| Jev ranking | 5,096 | 6,397 | -55% | 50% | 0.50 | 0/2 | 100% |
| Clef ranking | 7,251 | 8,283 | -35% | 50% | 0.50 | 0/2 | 100% |

Line coverage on the two held-out code tasks was 0.00 for all plugin arms: they found the correct file for one task but not the labelled ranges. B0 found both files but also returned mostly different ranges (0.12 coverage).

## What this shows

**The speed gain is real.** Jev ranking cuts median time by 76% on tuning and 55% on held-out. Nearly all remaining time is the decision model: discovery is 0.1–1.6s, ranking is 3–5s. B1 shows local search alone is roughly 25x faster than B0 on tuning tasks, but far less accurate.

**Quality is not there yet.** On the tuning split the Jev arm finds 5 of 6 labelled files (recall 0.83) but usually not first. On held-out it finds 1 of 2. The two absent-answer questions expose a structural gap: lexical candidates always exist, so the engine cannot tell "nothing here" from "weak matches". B0 handled both correctly.

**Jev beat Clef here.** Clef-flash scored 24 candidates in 7–9s and hit the 10s deadline in early runs, so it is capped at 12 candidates. That cap cost it the OpenCode config-schema task. Jev's 24-candidate configuration stayed inside the deadline. This measures these REST endpoints from this machine; a local Clef deployment could change the result.

**The bottleneck is candidate recall, not ranking.** The held-out OpenCode task and one tuning task were paraphrases with little lexical overlap (`choose which model...` vs `defaultModel`). The target file never entered the 24-candidate shortlist, so no ranker could select it. The first useful improvement is broader discovery — directory-level search, identifier expansion from the question, or a cheap first-pass decision over file paths — not a better reranker.

## Targets from the proposal

| Target | Result |
| --- | --- |
| ≥25% lower median than B0 | Met on tuning (-76%) and held-out (-55%) |
| ≤2pp lower macro recall@5 | Not met (-17pp tuning, -50pp held-out) |
| p95 no worse than B0 | Met on both splits |
| ≥95% valid completion | Met (100% in these runs) |

The speed and reliability targets pass; the quality target fails. That is the reason the plugin stays opt-in and explicit rather than replacing normal search.

## Threats to validity

- One repetition per task. Provider latency and model nondeterminism are not averaged.
- Ten tasks, two repositories, four held-out. Too small to claim general parity.
- Both repositories are popular and may appear in model training data.
- B0 is a generative agent with tools and can follow cross-file relationships; the plugin's first version deliberately does not. The comparison measures the current products, not an equal architecture.
- Wall time includes different startup paths (CLI process vs in-process engine). B0's cost is what a user actually waits for; a long-lived OpenCode session may start faster.
- Providers were reached over the public network from one machine on one day.

## Reproduce

```bash
# local checkouts and a DeepSeek-capable OpenCode
node bench/run.ts --arm lexical --split tuning
node bench/run.ts --arm jev --split tuning
node bench/run.ts --arm clef --split tuning
node bench/b0.ts --split tuning
node bench/compare.ts bench/runs/b0-tuning bench/runs/jev-tuning

# held-out, after freezing the implementation
node bench/run.ts --arm jev --split held-out
node bench/b0.ts --split held-out
```

`bench/b0.ts` accepts `--model` and `--repeat`. `bench/run.ts` accepts `--tasks`, `--repeat`, `--concurrency`, and `--out`.
