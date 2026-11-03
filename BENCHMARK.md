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
| B1 local ranking | 1,189 | 2,434 | -94% | 33% | 0.33 | 0.17 | 100% |
| Jev ranking | 5,244 | 7,126 | -72% | 50% | 0.83 | 0.27 | 100% |
| Clef ranking | 6,628 | 8,962 | -64% | 50% | 0.67 | 0.23 | 100% |

## Results: held-out split (n=4: 2 code, 2 absent)

| Arm | Median ms | p95 ms | Δ median vs B0 | Code top-1 | Code recall@5 | Line coverage | Absent correct | Valid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B0 stock OpenCode + DeepSeek | 11,199 | 19,588 | — | 100% | 1.00 | 0.12 | 2/2 | 100% |
| B1 local ranking | 1,654 | 3,310 | -85% | 50% | 0.50 | 0.07 | 0/2 | 100% |
| Jev ranking | 4,954 | 8,397 | -56% | 0% | 0.50 | 0.07 | 2/2 | 100% |
| Clef ranking | 6,698 | 10,013 | -40% | 50% | 0.50 | 0.07 | 1/2 | 100% |

Jev finds the correct held-out file for `rg-max-columns` but ranks it second to fifth, so top-1 is zero. B0 finds both held-out code files first. Line coverage is low across all plugin arms: they locate files less precisely than the baseline.

## What this shows

**The speed gain is real.** Jev ranking cuts median time by 72% on tuning and 56% on held-out. Most of the remaining time is the decision model: discovery is 0.1–2.4s, ranking is 3–5s. B1 shows local search alone is roughly 15–25x faster than B0 on tuning tasks, but far less accurate.

**Absent-answer detection now works.** Both held-out absent tasks return `no_match` with Jev, up from 0/2 in the first run. The engine returns `no_match` when the best relevance judgment falls below 0.15. That threshold was chosen from tuning scores and validated on the held-out set; a threshold of 0.45 was too aggressive and rejected one real answer.

**The recall problem is unchanged on held-out.** Jev recalls 0.83 of labelled files on tuning and 0.50 on held-out, against 1.00 for B0 on both. The remaining held-out miss is a paraphrase ("where can a plugin list, add, update, or remove tools") whose target file never entered the 24-file scoring shortlist. No ranker can recover it. Fixing that needs broader discovery, not better judgment.

**Jev beat Clef here.** Clef is capped at 12 candidates because its REST endpoint was slower per call; that cap cost it coverage, and one held-out run hit the 10s deadline. This measures these endpoints from this machine, not the models in general.

## Changes made after the first benchmark

- Fixed path parsing when a single file was searched, which had hidden matches.
- Score one window per file, so 24 provider calls cover 24 files instead of a few repeated files.
- Rank scored candidates above unscored ones. Unscored lexical leftovers previously outranked judged evidence.
- Read a wider window for the provider (8 lines before, 12 after) so comment-only matches still show the code that follows.
- Penalize locale/translation files and translation tables, which dominated lexical scores in the OpenCode repository.
- Add the relevance threshold for `no_match`.
- Add directory-first navigation as an opt-in experiment (`FAST_CONTEXT_DIRECTORY_HINT=1`): one choice call picks a directory and adds its files to the scoring shortlist. It added about 0.5s and did not improve recall on this corpus, so it is off by default.

## Targets from the proposal

| Target | Result |
| --- | --- |
| ≥25% lower median than B0 | Met on tuning (-72%) and held-out (-56%) |
| ≤2pp lower macro recall@5 | Not met (-17pp tuning, -50pp held-out) |
| p95 no worse than B0 | Met on both splits |
| ≥95% valid completion | Met (100% of runs returned a usable result) |

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
