# Retrieval experiment

## Added requirements

### Requirement: stage-level observability

Every candidate run SHALL record the post-discovery candidate pool, ranked candidates with raw decisions, abstention decision, final evidence ranges, stage timings, and fallback result.

#### Scenario: discovery failure

- **GIVEN** an answer-present task whose labelled file is absent from the candidate pool
- **WHEN** the run is scored
- **THEN** discovery is recorded as the failed stage
- **AND** the provider ranker is not blamed for the miss

#### Scenario: false abstention

- **GIVEN** a labelled file reached the provider pool
- **WHEN** the arm returns no match
- **THEN** the run records a false abstention separately from ranking recall

### Requirement: provenance-backed corpus

Each task SHALL cite a pinned pre-fix commit, public issue or problem statement, accepted fix evidence, transformation record, qrels, and reviewer decisions. Absent tasks SHALL include commit-history evidence that the behavior is absent.

#### Scenario: task admission

- **WHEN** a task lacks a pinned commit, accepted fix evidence, or two completed relevance judgments
- **THEN** corpus validation rejects it

### Requirement: registered hill-climb

Each measured variant SHALL have a parent, hypothesis, changed mechanism, expected outcome, fixed limits, and promotion rule committed before its run.

#### Scenario: variant promotion

- **WHEN** a variant improves its targeted stage and passes all registered guardrails
- **THEN** it may replace its parent for the next generation
- **ELSE** it remains an unsuccessful or inconclusive experiment

### Requirement: hidden confirmatory evaluation

The final corpus SHALL be created after the implementation, prompts, thresholds, analysis, and sample-size rule are frozen. It SHALL be unsealed once.

#### Scenario: post-unsealing change

- **WHEN** code, labels, prompts, thresholds, exclusions, or primary metrics change after unsealing
- **THEN** the run is void for confirmatory claims
- **AND** a protocol amendment and a newly hidden corpus are required

### Requirement: joint decision rule

The selected arm SHALL pass both registered primary tests: Recall@5 non-inferiority within 0.05 and paired median latency ratio below 0.75, using the registered confidence intervals.

#### Scenario: speed passes and quality fails

- **WHEN** the latency test passes but the quality test does not
- **THEN** the benchmark SHALL report that the joint claim failed

### Requirement: reproducible raw records

Every report SHALL be generated from append-only records and a frozen manifest. Analysis SHALL reject missing paired arms, mixed corpus versions, mismatched commits, duplicate run IDs, and unregistered configurations.

#### Scenario: clean reproduction

- **WHEN** a clean checkout receives the published manifest, corpus, qrels, and run records
- **THEN** it regenerates the published tables and decision without provider access

