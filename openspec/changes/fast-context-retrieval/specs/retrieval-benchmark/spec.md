# Spec Delta

## Purpose

Measures and compares retrieval latency, accuracy, and token efficiency of Jev and Clef against OpenCode default DeepSeek search.

## ADDED Requirements

### Requirement: Benchmark evaluation suite
The benchmark suite SHALL execute a fixed set of codebase localization tasks against a reference repository with known ground-truth file and line locations.

#### Scenario: Running test queries
- **WHEN** the benchmark command runs against the test repository
- **THEN** it executes each query across Jev, Clef, and OpenCode default DeepSeek search configurations

### Requirement: Comparative metric capture
The benchmark suite SHALL record end-to-end wall-clock latency, Precision@5 of returned files, and total tokens consumed in the main conversation context.

#### Scenario: Metric aggregation across engines
- **WHEN** all benchmark tasks complete
- **THEN** the suite calculates median latency, mean precision, and token deltas for each tested search engine

### Requirement: Structured reporting
The benchmark suite SHALL output a comparative Markdown report contrasting Jev, Clef, and DeepSeek default search performance.

#### Scenario: Report generation
- **WHEN** test execution finishes
- **THEN** the suite writes a summary table detailing latency, precision, and token consumption by engine
