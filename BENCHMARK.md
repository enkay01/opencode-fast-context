# Benchmark: decision-guided retrieval vs stock OpenCode

Measured 2026-11-03 on one Apple Silicon Mac, OpenCode 2.2.5, Node 26.5.0. One run per task per arm. Re-run before citing these numbers; they do not establish general parity.

## Method

- **B0**: unmodified OpenCode with `opencode-go/deepseek-v4.1-flash`, normal tools, fresh `opencode run --standalone` process per task. Prompt asks only for `path:start-end` lines or an exact `NO_ANSWER`.
- **B1**: this engine with deterministic lexical ranking, no decision provider.
- **J**: the same candidates ranked by Jev (`jev-1.14.0`).
- **C**: the same candidates ranked by `clef-flash` on Cloudflare Workers AI.

B0 runs in a temporary `HOME` with a minimal config (`plugins: []`) and a symlinked auth file, so no user or project plugin is loaded. The runner records the effective config paths, plugin list, config hash, and each checkout's `git rev-parse HEAD`. It refuses to run if the plugin appears in the resolved plugin list, or if a checkout does not match its pinned commit.

B0 answers are parsed strictly. A citation is accepted only if the path stays inside the worktree, exists, and has a valid inclusive line range within the file. Anything else is dropped and counted as invalid. A run counts as a failure if the process exits non-zero or times out. An empty answer is a correct no-answer only when the response is exactly `NO_ANSWER`; an empty or unparseable answer without it is malformed and not a valid absent answer.

Corpus: 14 tasks over two pinned checkouts.

- ripgrep `e89fff89ac9af12e8d4ce9d5fd07beb408ca730f` (tag 15.2.0)
- OpenCode `6d1c444b8c53da667b51ed45b0a7c0aca1174674`

Splits:

- **tuning** (6): used while building discovery and ranking.
- **development** (4): the original held-out set. It exposed a 0/2 absent-detection result and informed the 0.15 threshold, so it is development data now, not held-out.
- **validation** (4, 2 code + 2 absent): written after the retrieval code was frozen. These tasks were not used for any tuning decision.

Metrics: top-1, recall@5, fixed-denominator precision@5 (relevant among the first five divided by five, so one relevant result scores 0.20), line coverage, and absent-answer accuracy. Valid completion means the run finished with a usable result and was not a process failure or malformed answer. Fallback time is recorded separately when a candidate arm asks the caller to fall back.

## Results: fresh validation split (primary)

| Arm | Median ms | p95 ms | Δ median vs B0 | Code top-1 | Code recall@5 | Line coverage | Absent correct | Valid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B0 stock OpenCode + DeepSeek | 18,636 | 38,525 | — | 100% | 1.00 | 0.61 | 2/2 | 100% |
| B1 local ranking | 790 | 3,346 | -96% | 50% | 0.50 | 0.00 | 0/2 | 100% |
| Jev ranking | 5,064 | 7,325 | -73% | 50% | 0.50 | 0.10 | 2/2 | 100% |
| Clef ranking | 6,747 | 8,705 | -64% | 0% | 0.00 | 0.00 | 2/2 | 100% |

On the two fresh code tasks, Jev returned the correct file for `oc-permission-effect` (top-1) and a false `no_match` for `rg-type-matcher`. The false `no_match` is a threshold error, not a ranking error: the best relevance score fell below 0.15. Clef found neither file. Both decision arms rejected both absent tasks.

## Results: tuning split (used for development)

| Arm | Median ms | p95 ms | Δ median vs B0 | Top-1 | Recall@5 | Line coverage | Valid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B0 stock OpenCode + DeepSeek | 44,172 | 169,146 | — | 100% | 1.00 | 0.88 | 100% |
| B1 local ranking | 844 | 1,726 | -98% | 33% | 0.33 | 0.17 | 100% |
| Jev ranking | 4,688 | 6,021 | -89% | 50% | 0.83 | 0.27 | 100% |
| Clef ranking | 6,072 | 6,886 | -86% | 50% | 0.67 | 0.23 | 100% |

The B0 p95 comes from one 169-second run (`oc-default-model`). B0's time is highly variable because the agent decides how much to explore.

## What this shows

**Speed holds.** Jev is 89% faster on tuning and 73% faster on fresh validation. Most candidate time is provider scoring, not local search. B1 shows local search alone is roughly 20–50x faster than B0 but much less accurate.

**Quality does not hold on fresh tasks.** Jev's fresh-set recall is 0.50, the same as the old development set, and it fails one task through an over-eager no-answer threshold. B0 recalls both code files and both absent tasks. The speed gain is real; the accuracy claim is not established.

**No-answer detection is a threshold tradeoff, not a solved problem.** With 0.15, Jev rejected both unseen absent tasks and one real task. Lowering the threshold would recover `rg-type-matcher` but may accept absent questions again. Four validation tasks are too few to pick a better operating point.

**Jev beat Clef here.** Clef stays capped at 12 candidates because its REST endpoint was slower per call. On fresh tasks it found neither code file. This measures these endpoints from this machine, not the models in general.

## Review fixes applied

- B0 failure handling: non-zero exits and timeouts are failures; an empty answer without exact `NO_ANSWER` is malformed and never counted as a correct absent answer.
- Citation validation: paths must stay inside the worktree and ranges must fit the file; invalid citations are dropped and counted.
- Baseline isolation: temporary HOME with `plugins: []`, recorded and hashed effective config, and explicit rejection if this plugin appears. Checkout HEAD is compared with the pinned commit before any task runs.
- Precision@5 now uses a fixed denominator of five. Tests cover one-result and five-result cases.
- Discovery timeouts now return `fallback_required` instead of `no_match`. The candidate runner measures ordinary-search fallback separately when it is invoked.
- A fresh `validation` split was added; the old held-out split is relabelled `development` and no longer used for claims.

## Limits

- One run per task. B0 varies from 16 to 169 seconds across tasks, and the model was nondeterministic: one smoke run answered `NO_ANSWER` for `rg-type-matcher`, a later run answered correctly.
- Four fresh tasks cannot establish generalization.
- Both repositories are popular and may appear in model training data.
- Isolation removes plugins but OpenCode still reads host-level `.opencode` command/skill directories. The recorded config shows no plugins; that does not make the host bit-for-bit stock.
- No candidate arm triggered `fallback_required` on the validation split, so fallback timing is implemented but unmeasured there.
- Provider latency is a single day of public-network calls from one machine.

## Reproduce

```bash
node bench/b0.ts --split validation            # isolated stock baseline
node bench/run.ts --arm jev --split validation
node bench/run.ts --arm clef --split validation
node bench/run.ts --arm lexical --split validation
node bench/compare.ts bench/runs/b0-validation bench/runs/jev-validation
```

Run directories are local and gitignored because they contain repository excerpts.
