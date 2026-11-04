# Tasks

## 1. Align the public and harness contract

- [ ] 1.1 Replace README answer-engine wording and remove experimental/quality-parity warnings from normal setup/use.
- [ ] 1.2 Align tool description, query/maxFiles descriptions, autoInvoke guidance, and Jev relevance criteria with retrieving code and document context.
- [ ] 1.3 Generate docs/agent-contract.md from the registered contract; add a drift check.
- [ ] 1.4 Keep measured benchmark records in BENCHMARK.md and preserve credential/source-transmission documentation.

## 2. Verify the consumer session

- [ ] 2.1 Capture effective description and schema from a real isolated OpenCode 2 session, using supported inspection or a mock model request.
- [ ] 2.2 Assert query is required, extra fields rejected, and maxFiles bounds and upper-bound meaning match registration.
- [ ] 2.3 Verify suggest guidance appears once and off removes guidance while keeping the tool catalog entry.
- [ ] 2.4 Record runtime version and sanitized contract evidence in the verification output.

## 3. Improve retrieval relevance

- [ ] 3.1 Create a synthetic mixed code/design-document corpus and independently review expected relevant-file labels before tuning.
- [ ] 3.2 Record existing discovery, ranker, selection, precision, recall, returned counts, and latency on that corpus.
- [ ] 3.3 Trace distractors to their stage and implement a measured fix, including returning fewer files when evidence is weak.
- [ ] 3.4 Validate on untouched paraphrases; require useful-file recall to be preserved alongside distractor reduction and report latency change.
- [ ] 3.5 Preserve code retrieval, absent-query, redaction, fallback, and cancellation regressions.

## 4. Teach the caller and review

- [ ] 4.1 Add focused-query and planning/status examples using normal directory and git checks alongside retrieval.
- [ ] 4.2 Document complete/no_match semantics and the encrypted-content boundary without generic hedging.
- [ ] 4.3 Run the full release verification and OpenSpec validation; request Code Review Partner review against this change.
- [ ] 4.4 Prepare a versioned GitHub release handoff after approval; installation/publication require an implementation assignment.

