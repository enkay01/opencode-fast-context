## Purpose

Extend the retrieval result contract so a negative answer reports what was searched, and so the two observed noise classes are ranked down.

## ADDED Requirements

### Requirement: Searched scope on negative results

A `no_match` result SHALL include the searched scope: the candidate count considered, the number of distinct files examined, and whether discovery was truncated by the deadline. The field SHALL also be present on `complete` results for a uniform shape.

#### Scenario: Candidate pool has no passing match

- WHEN ranking completes and no candidate reaches the match threshold
- THEN the result status is `no_match` and the payload reports how many candidates and distinct files were examined, plus truncation state

#### Scenario: Discovery hits the deadline

- WHEN the elapsed budget stops discovery before the pool is exhausted
- THEN the truncation flag is set so the caller can tell a bounded negative from a full negative

### Requirement: Entry-file penalty in discovery

`src/engine/discover.ts` SHALL multiply the lexical score of generic application entry files when no query token matches the file name, and SHALL multiply the score of `.html` and `.css` files under design export directories. Neither class SHALL be excluded outright.

#### Scenario: Regression coverage

- WHEN the held-out benchmark tasks are re-run after this change
- THEN Recall@5 does not fall below the pre-change value on those tasks
