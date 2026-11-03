## Purpose

Make repository localization comparisons repeatable and expose speed, evidence quality, and failures for stock OpenCode and candidate retrieval strategies.

## ADDED Requirements

### Requirement: Reproducible baseline
The runner SHALL record the repository commit, task id, prompt, OpenCode version, effective configuration, model/provider identity, limits, and cache conditions for each run. B0 SHALL use stock search behavior without the fast context plugin.

#### Scenario: DeepSeek baseline
- WHEN a baseline task runs
- THEN its manifest identifies the selected DeepSeek provider/model and confirms that the plugin is disabled

### Requirement: Independent evidence labels
The corpus SHALL contain reviewed relevant files and ranges, separate tuning and held-out tasks, and absent-answer cases. Candidate models SHALL NOT receive labels or serve as the sole evaluator.

#### Scenario: Useful unchanged source
- WHEN a returned file explains the requested behavior but is not edited in a related fix
- THEN the evaluator scores it against reviewed evidence labels rather than rejecting it because it was not edited

### Requirement: Paired measurement
The runner SHALL compare arms on identical task revisions with repeated fresh sessions and record elapsed time, evidence quality, usage availability, and errors. It SHALL retain unsuccessful runs in reports.

#### Scenario: Candidate timeout
- WHEN candidate retrieval times out and ordinary search completes
- THEN the report records the candidate timeout and the complete fallback elapsed time separately from successful candidate runs

### Requirement: Honest reports
Reports SHALL include per-task results, aggregate variability, experiment configuration, and missing measurements. They SHALL exclude credentials and private source text from published output.

#### Scenario: Usage unavailable
- WHEN a provider does not report token usage
- THEN the report marks usage unavailable instead of recording zero
