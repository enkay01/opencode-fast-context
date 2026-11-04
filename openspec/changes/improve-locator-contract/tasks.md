# Tasks

## 1. Reposition the tool

- [ ] 1.1 Rewrite TOOL_DESCRIPTION and schema descriptions as the canonical locator contract in design.md; recommend known identifiers without requiring filenames or claiming all narrative queries are worse.
- [ ] 1.2 Rewrite `AUTO_INVOKE_GUIDANCE` in `src/guidance.ts` to keep its routing job while dropping any implication that the tool resolves the task.
- [ ] 1.3 Update the README opening paragraph and "What it does" list to retrieval wording.
- [ ] 1.4 Add a test asserting the description contains the limits wording and does not contain "answer" as a claim about the caller's question.
- [ ] 1.5 Generate docs/agent-contract.md from registered definitions and add a drift check.

## 2. Move the disclosure

- [ ] 2.1 Remove the experimental and parity warning block from the README opening.
- [ ] 2.2 Rewrite the README benchmark section to state the measured latency figures with sample sizes and link `BENCHMARK.md` for method and limits. Do not edit `BENCHMARK.md`.
- [ ] 2.3 Confirm `CHANGELOG.md` retains its historical wording.
- [ ] 2.4 Confirm no test asserts the removed warning text.

## 3. Report searched scope

- [ ] 3.1 Add a `searched` field to the result shape: `candidates`, `files`, `truncated`.
- [ ] 3.2 Populate scope on all result paths using the precise candidate-window/distinct-file/deadline definitions in design.md; preserve timeout status semantics.
- [ ] 3.3 Format it in `formatForModel` so the negative result reads as bounded.
- [ ] 3.4 Test zero-work configuration failure, complete, no_match, partial and provider failure; deadline truncation does not become a global absence claim.

## 4. Align the provider prompts

- [ ] 4.1 Rewrite the relevance prompt in `src/providers/types.ts` line 57 to ask whether the snippet is relevant context, not whether it answers the question.
- [ ] 4.2 Rewrite the matching prompt in `src/providers/systemone.ts` line 125 to the same framing.
- [ ] 4.3 Update prompt tests to the new wording and confirm no test asserts the "answers" phrasing.
- [ ] 4.4 Label mixed code/design fixtures before prompt tuning; capture baseline/candidate stage traces and precision, Recall@5, counts, and latency. Include useful HTML/design/entry files not named by queries.
- [ ] 4.5 Verify useful-file recall on untouched acceptance paraphrases; use prior benchmark tasks only as regressions. Record mock checks and live evaluations separately. Discovery scoring and selection thresholds stay unchanged.

## 5. Verify

- [ ] 5.1 `npm run verify:release` passes from a clean tree.
- [ ] 5.2 GitHub Actions verification passes on Node 22, 24, and 26.
- [ ] 5.3 Extend the real isolated OpenCode runtime check to capture effective description, schema, and guidance using supported inspection or a fake model request; verify query/maxFiles validation, suggest once, off retaining tool registration, and no context-preparation provider calls.
- [ ] 5.4 Code Review Partner reviews this change against the proposal before merge.
- [ ] 5.5 Record runtime version and sanitized harness evidence; confirm no runtime implementation, release, or local install is implied by proposal approval alone.

## Deferred, not in this change

- [ ] Use the stage traces and comparison cases from task 4 to decide whether a separate scoring-policy proposal is warranted.
- [ ] Evaluate a different result-count policy only if traces show weak candidates filling slots. maxFiles remains a ceiling under existing behavior; no new threshold or penalty is mandated here.
