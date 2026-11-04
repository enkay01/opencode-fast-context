## ADDED Requirements

### Requirement: Mixed-material relevance
Evaluation SHALL include code and readable design documents with relevant-file labels fixed before tuning, stage traces, and untouched acceptance paraphrases. It SHALL measure precision among returned files, recall@5, returned count, and latency.

#### Scenario: Tangential files share query terms
- WHEN a fixture includes relevant design records and tangential HTML/application files
- THEN evaluation distinguishes them by task relevance without relying on file extensions alone

### Requirement: Result count is a ceiling
maxFiles SHALL be an upper bound. The selection policy SHALL permit fewer results when remaining candidates lack relevance, and its acceptance evaluation SHALL preserve useful-file recall while reducing distractors.

#### Scenario: Only a subset is relevant
- WHEN fewer than maxFiles candidates satisfy the measured relevance policy
- THEN the tool returns that subset without filling remaining slots with weak candidates

