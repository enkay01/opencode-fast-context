# Retrieval hill-climb and confirmatory experiment

Status: pre-registration draft. No result may be described as confirmatory until this file, the corpus manifest, the analysis script, and the final task IDs are committed before the final runs begin.

## The professional move

A retrieval researcher would stop treating recall@5 as one opaque outcome. The current system has four causal stages:

1. discovery must place a relevant file in the candidate pool;
2. ranking must place a relevant candidate in the first five results;
3. abstention must distinguish a missing answer from a weak answer;
4. range extraction must return useful lines from a relevant file.

Each stage needs an observable output and its own promotion test. A change should enter the next stage only when it improves the stage it targets without crossing the latency, completion, or downstream-quality guardrails. The final comparison must use tasks that no implementation decision has seen.

## Raw material

The experiment starts from evidence that predates this benchmark:

- pinned source trees at pre-fix commits;
- real issue text and accepted pull requests from public repositories;
- the accepted patch, review discussion, and tests that establish where the behavior changed;
- independently reviewed relevance judgments at file and line-range level;
- raw candidate lists, provider responses, commands, timings, config documents, commit hashes, and failure records from every run.

The benchmark report, current aggregate scores, model explanations, and hand-written summaries are derived material. They can suggest hypotheses, but they cannot supply questions, labels, or proof for the confirmatory set.

Answer-present tasks come from real issues. The query is the issue title and problem statement with direct file paths and symbol names removed by a written rule. The repository is pinned immediately before the accepted fix. Relevant files and ranges come from the accepted patch, its tests, and a second source review.

Absent tasks use the same issue at a commit before the behavior exists, or a closely matched repository where commit history proves the behavior is absent. An absent label requires two independent reviewers to find no answering code and a later commit or accepted patch that shows what was missing. Synthetic impossible questions are excluded.

## Claims and endpoints

The experiment tests one joint claim: the selected fast-context policy is materially faster than stock OpenCode search while preserving retrieval quality.

Both primary tests must pass:

- Quality non-inferiority: on answer-present tasks, the lower bound of the one-sided 95% confidence interval for paired Recall@5 difference, candidate minus B0, is greater than -0.05.
- Speed superiority: the upper bound of the 95% confidence interval for the paired median latency ratio, candidate divided by B0, is below 0.75.

Secondary guardrails:

- no-answer specificity difference has a one-sided 95% lower bound greater than -0.05;
- valid completion is at least 0.95 for each arm;
- fallback rate and full candidate-plus-fallback latency are reported separately;
- line coverage, MRR, context bytes, provider calls, token counts, and estimated cost are reported without changing the primary decision.

No weighted score combines speed and quality. A fast system that misses the quality bound fails. A quality-matched system that misses the speed bound fails.

## Instrumentation contract

Every run record must contain:

- corpus version, task ID, repository URL, pinned commit, and qrel version;
- arm ID, implementation commit, full limits, feature flags, prompt hash, provider and model version;
- randomized block, repetition, cache condition, start time, monotonic stage timings, and wall time;
- candidate file IDs before ranking, ranked candidates with raw provider decisions, final ranges, abstention decision, and fallback result;
- exit status, timeout status, malformed-output status, invalid citations, stderr digest, and valid-completion status;
- machine model, OS, Node and OpenCode versions, effective OpenCode config hash, plugin list, and dependency lockfile hash.

Raw records are append-only JSONL. Reports are regenerated from raw records. The analysis script refuses mixed corpus versions, mismatched commits, missing arms, duplicate run IDs, or unregistered configuration values.

## Hill-climb

### Frozen starting point

`1137754` is H0, the last reviewed commit before this protocol. Existing validation tasks become development evidence and cannot return to a final set. Any uncommitted retrieval work is registered as a named variant before it is measured.

### Development corpus

Build 80 development tasks from at least eight repositories and four languages:

- 60 answer-present tasks;
- 20 historically grounded absent tasks;
- at least 15 tasks in each of symbol, behavior, cross-file flow, and configuration or policy strata;
- repository size buckets recorded before task selection.

Labels stay hidden from the retrieval process. Two reviewers judge each task. Disagreements are resolved before any variant is run. Cohen's kappa for file relevance and raw range-overlap agreement are published.

### Diagnostic outputs

For every answer-present run, record these binary or numeric outcomes before the final answer is scored:

1. `discovery_hit_at_budget`: a relevant file is in the pre-provider pool;
2. `rank_hit_at_5_given_discovery`: a relevant file is in the first five when discovery succeeded;
3. `false_abstention`: the arm returns no match on an answer-present task;
4. `range_coverage_given_file`: labelled lines covered after a relevant file is returned.

For absent tasks, record candidate volume, maximum decision score, abstention decision, and any fallback result. This separates a threshold problem from a discovery problem.

### Registered variants

Run one causal family at a time against H0:

| Generation | Hypothesis | Variants | Promotion measure |
| --- | --- | --- | --- |
| H1 | the relevant file is excluded by the 24-file provider budget | 24, 48, and 64 unique files | discovery hit rate and added milliseconds |
| H2 | query wording does not match code vocabulary | H1 winner plus identifier splitting, stemming, symbol definitions, and import expansion as separate ablations | discovery hit rate by task stratum |
| H3 | flat search misses repository structure | H2 winner versus directory-to-file choice with the same provider-call budget | discovery hit rate and provider latency |
| H4 | one window per file hides the answering range | one, two, and three disjoint windows per file with a fixed total context budget | conditional ranking hit and range coverage |
| H5 | a single relevance threshold confuses weak answers with absent answers | calibrated abstention using held-back development folds | false-abstention and no-answer specificity |
| H6 | fallback can recover the remaining tail | selected candidate arm alone versus candidate plus stock fallback | end-to-end recall, latency, and fallback rate |

The order may change only through an amendment committed before the affected runs. New variants need a stated failure mode, a changed mechanism, and a predicted metric movement.

### Promotion rule

Use repository-stratified five-fold cross-validation inside the development corpus. Tune a variant on four folds and score it once on the fifth. Aggregate only out-of-fold predictions.

A variant replaces its parent when all of these hold:

- the targeted stage improves by at least 0.05 absolute or fixes at least half of the parent's failures in its intended stratum;
- answer-present Recall@5 does not fall by more than 0.02;
- no-answer specificity does not fall by more than 0.02;
- valid completion remains at least 0.95;
- median latency rises by no more than 20% unless the variant crosses the primary quality bound for the first time.

Use paired repository-stratified bootstrap intervals with 10,000 resamples. Keep the parent when the interval crosses both a useful gain and a harmful regression. Record it as inconclusive. Do not tune against the final set.

Stop the climb when two consecutive registered generations fail promotion, the candidate meets both primary targets, or the registered provider-call budget is exhausted.

## Confirmatory experiment

### Corpus and sample size

Create a new hidden set after the implementation and thresholds are frozen. None of its issues, paths, labels, or repositories may have informed the climb.

Use a paired non-inferiority power calculation for Recall@5 based on the out-of-fold discordant-pair rate from development, with alpha 0.05, power 0.80, and margin 0.05. Use the larger sample required by the quality and no-answer tests. The provisional floor is 120 answer-present tasks and 40 absent tasks across at least twelve repositories; the cap is 240 answer-present and 80 absent. If the cap is underpowered, report the experiment as unable to establish non-inferiority before running it.

### Run design

- Compare isolated stock OpenCode with DeepSeek, the selected fast-context arm alone, and the selected arm with fallback.
- Run five repetitions per task and arm in randomized blocks. Randomize arm order within each task and repetition.
- Separate fresh-process and reused-process conditions. Use explicit provider-cache and candidate-cache fields. Do not call an unknown cache state cold.
- Apply the same wall-clock limit and validated output contract to every arm.
- Keep failed and timed-out runs in the denominator.
- Run on one fixed machine first. Replicate the selected comparison on a second machine or CI runner before publishing a general latency claim.

The final corpus is unsealed once. No code, prompt, threshold, label, exclusion, or metric changes follow unsealing. A defect in the harness voids the run, requires a protocol amendment, and requires a newly hidden set.

### Analysis

Use paired, repository-stratified bootstrap intervals for recall differences and latency ratios. Report task-level paired results and distributions, not only macro averages. Correct secondary comparisons with Holm's method. Publish the complete accounting of excluded tasks, invalid runs, timeouts, and fallbacks.

Run a leave-one-repository-out sensitivity analysis. Report answer-present results by task stratum, language, and repository-size bucket. The claim fails if it depends on one repository and the leave-one-repository-out interval crosses the quality margin.

## Independent evidence

The result is credible when all of these exist outside the authors' judgment:

- a committed protocol and analysis script whose hashes predate final execution;
- a hidden final corpus produced from public issue and commit history;
- two-person relevance judgments with published agreement and adjudication records;
- raw append-only run records that regenerate every table;
- a clean-clone CI job that verifies the harness and a second-machine replication of the selected comparison;
- confidence intervals that pass both registered primary tests without post-hoc exclusions.

The success claim is then made by the protocol's decision rule. Neither a model confidence score nor an author's reading of the table can substitute for it.

