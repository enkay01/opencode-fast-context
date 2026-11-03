# Tasks

## 1. Freeze the protocol

- [x] 1.1 Review and commit `EXPERIMENT_PROTOCOL.md` before new measured variants run.
- [x] 1.2 Record H0 as commit `1137754`; register any existing uncommitted retrieval work as named variants. `bench/experiment/manifest.json` registers WIP-climb1/2/3 and H1-24/48/64.
- [x] 1.3 Add a machine-readable experiment manifest and protocol hash.

## 2. Deepen benchmark observability

- [x] 2.1 Record discovery pools, ranked decisions, abstention inputs, range extraction, and stage timings.
- [x] 2.2 Add stable run IDs and append-only JSONL output.
- [x] 2.3 Make analysis reject mixed, incomplete, duplicated, or unregistered runs.
- [x] 2.4 Add tests for each rejection path and stage classification.

## 3. Build the development corpus

- [ ] 3.1 Define repository, language, size, license, and task-stratum admission rules.
- [ ] 3.2 Add issue, pull request, commit, test, and transformation provenance to the corpus schema.
- [ ] 3.3 Build 60 answer-present and 20 historically absent tasks across at least eight repositories.
- [ ] 3.4 Collect two independent qrels and adjudicate disagreements.
- [ ] 3.5 Publish agreement statistics and corpus validation results.

## 4. Run the hill-climb

- [ ] 4.1 Measure H0 through repository-stratified five-fold evaluation.
- [x] 4.2 Run H1 provider-budget ablations. Preliminary: six tuning tasks, one repetition; see `bench/experiment/H1-result.md`. Budget 24 retained.
- [ ] 4.3 Run H2 vocabulary-expansion ablations.
- [ ] 4.4 Run H3 hierarchical navigation if its hypothesis remains supported.
- [ ] 4.5 Run H4 multi-window ablations under a fixed context budget.
- [ ] 4.6 Calibrate H5 abstention using out-of-fold predictions.
- [ ] 4.7 Measure H6 fallback as a full policy.
- [ ] 4.8 Freeze the selected implementation, prompt, limits, and thresholds.

## 5. Run the confirmatory experiment

- [ ] 5.1 Compute the paired sample size from development discordance.
- [ ] 5.2 Build and seal the independently reviewed final corpus.
- [ ] 5.3 Randomize and execute five paired repetitions per task and arm.
- [ ] 5.4 Regenerate the report from raw records and apply the joint decision rule.
- [ ] 5.5 Run leave-one-repository-out sensitivity analysis.
- [ ] 5.6 Replicate the selected comparison on a second machine or CI runner.
- [ ] 5.7 Publish the protocol, amendments, corpus provenance, qrels, raw records, analysis, and complete failure accounting.

