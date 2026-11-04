# Tasks

## 1. Reposition the tool

- [x] 1.1 Rewrite TOOL_DESCRIPTION and schema descriptions as the canonical locator contract in design.md; recommend known identifiers without requiring filenames or claiming all narrative queries are worse. — Locator wording from design.md now lives in `TOOL_DESCRIPTION` and schema descriptions.
- [x] 1.2 Rewrite `AUTO_INVOKE_GUIDANCE` in `src/guidance.ts` to keep its routing job while dropping any implication that the tool resolves the task. — `AUTO_INVOKE_GUIDANCE` routes to the tool without claiming it resolves the task.
- [x] 1.3 Update the README opening paragraph and "What it does" list to retrieval wording. — README opening and workflow use retrieval wording.
- [x] 1.4 Add a test asserting the description contains the limits wording and does not contain "answer" as a claim about the caller's question. — `test/contract.test.ts` asserts the limits wording and rejects answer claims.
- [x] 1.5 Generate docs/agent-contract.md from registered definitions and add a drift check. — `scripts/generate-agent-contract.mjs`; `docs/agent-contract.md`; verify runs `--check`.

## 2. Move the disclosure

- [x] 2.1 Remove the experimental and parity warning block from the README opening. — Warning block removed.
- [x] 2.2 Rewrite the README benchmark section to state the measured latency figures with sample sizes and link `BENCHMARK.md` for method and limits. Do not edit `BENCHMARK.md`. — README benchmark section states latency figures with sample sizes and links BENCHMARK.md; BENCHMARK.md untouched.
- [x] 2.3 Confirm `CHANGELOG.md` retains its historical wording. — CHANGELOG retains its release record.
- [x] 2.4 Confirm no test asserts the removed warning text. — No test asserts the removed warning.

## 3. Report searched scope

- [x] 3.1 Add a `searched` field to the result shape: `candidates`, `files`, `truncated`. — `SearchedScope` added to every result.
- [x] 3.2 Populate scope on all result paths using the precise candidate-window/distinct-file/deadline definitions in design.md; preserve timeout status semantics. — Counts come from the discovered candidate pool; truncation follows the discovery deadline; zero before discovery and preserved after provider failure.
- [x] 3.3 Format it in `formatForModel` so the negative result reads as bounded. — `formatForModel` prints searched scope and bounded no_match wording.
- [x] 3.4 Test zero-work configuration failure, complete, no_match, partial and provider failure; deadline truncation does not become a global absence claim. — Tests cover complete, no_match, config failure, partial, provider failure, and discovery deadline.

## 4. Align the provider prompts

- [x] 4.1 Rewrite the relevance prompt in `src/providers/types.ts` line 57 to ask whether the snippet is relevant context, not whether it answers the question. — Prompt now asks whether the snippet is relevant context.
- [x] 4.2 Rewrite the matching prompt in `src/providers/systemone.ts` line 125 to the same framing. — Matching prompt updated in `systemone.ts`.
- [x] 4.3 Update prompt tests to the new wording and confirm no test asserts the "answers" phrasing. — Contract test rejects answer phrasing in prompts.
- [x] 4.4 Label mixed code/design fixtures before prompt tuning; capture baseline/candidate stage traces and precision, Recall@5, counts, and latency. Include useful HTML/design/entry files not named by queries. — Fixed mixed code/document fixture and live legacy-versus-locator comparison in `bench/locator-compare.ts`; traces in `bench/locator/runs/`.
- [x] 4.5 Verify useful-file recall on untouched acceptance paraphrases; use prior benchmark tasks only as regressions. Record mock checks and live evaluations separately. Discovery scoring and selection thresholds stay unchanged. — Both arms measured mean recall@5 0.80 and precision 0.28 on five tuning tasks, and recall@5 1.00 with precision 0.29 on two acceptance paraphrases; discovery scoring and thresholds unchanged. This is not held-out evidence.

## 5. Verify

- [x] 5.1 `npm run verify:release` passes from a clean tree. — Local `npm run verify:release` passed on `4308139`: 75 tests, build, agent-contract drift, API and runtime contract smokes, real runtime load, package and secret checks.
- [x] 5.2 GitHub Actions verification passes on Node 22, 24, and 26. — Run 41885236494 passed all three jobs.
- [x] 5.3 Extend the real isolated OpenCode runtime check to capture effective description, schema, and guidance using supported inspection or a fake model request; verify query/maxFiles validation, suggest once, off retaining tool registration, and no context-preparation provider calls. — `scripts/smoke-contract-runtime.mjs` captures the model-visible description, schema (`query` required, `additionalProperties: false`, maxFiles 1-20 and ceiling wording), and suggest/off guidance in a real OpenCode 2.2.5 run against a local fake OpenAI-compatible transport, with no Jev call. `scripts/smoke-opencode.mjs` also checks the registered definitions and zero fetches during context preparation.
- [ ] 5.4 Code Review Partner reviews this change against the proposal before merge.
- [x] 5.5 Record runtime version and sanitized harness evidence; confirm no runtime implementation, release, or local install is implied by proposal approval alone. — `docs/runtime-evidence.md` records runtime version, hashes, commands, and prompt-comparison limits.

## Deferred, not in this change

- [ ] Use the stage traces and comparison cases from task 4 to decide whether a separate scoring-policy proposal is warranted.
- [ ] Evaluate a different result-count policy only if traces show weak candidates filling slots. maxFiles remains a ceiling under existing behavior; no new threshold or penalty is mandated here.
