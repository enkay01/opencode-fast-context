# Tasks

## 1. Reposition the tool

- [ ] 1.1 Rewrite `TOOL_DESCRIPTION` in `src/tool.ts` as a locator: returns files and line ranges to read, does not answer the question, cannot prove absence, pair with directory listing or `git status` for status questions, prefer concrete identifiers over narrative phrasing.
- [ ] 1.2 Rewrite `AUTO_INVOKE_GUIDANCE` in `src/guidance.ts` to keep its routing job while dropping any implication that the tool resolves the task.
- [ ] 1.3 Update the README opening paragraph and "What it does" list to retrieval wording.
- [ ] 1.4 Add a test asserting the description contains the limits wording and does not contain "answer" as a claim about the caller's question.

## 2. Move the disclosure

- [ ] 2.1 Remove the experimental and parity warning block from the README opening.
- [ ] 2.2 Rewrite the README benchmark section to state the measured latency figures with sample sizes and link `BENCHMARK.md` for method and limits. Do not edit `BENCHMARK.md`.
- [ ] 2.3 Confirm `CHANGELOG.md` retains its historical wording.
- [ ] 2.4 Confirm no test asserts the removed warning text.

## 3. Report searched scope

- [ ] 3.1 Add a `searched` field to the result shape: `candidates`, `files`, `truncated`.
- [ ] 3.2 Populate it on `no_match` and `complete` in `src/engine/search.ts`.
- [ ] 3.3 Format it in `formatForModel` so the negative result reads as bounded.
- [ ] 3.4 Test: `no_match` reports scope; deadline truncation sets the flag; `complete` carries the same field.

## 4. Down-weight the observed noise

- [ ] 4.1 Add the design-export multiplier for `.html` / `.css` under design directories in `src/engine/discover.ts`.
- [ ] 4.2 Add the entry-file multiplier for `App.tsx`, `App.jsx`, `main.tsx`, `index.tsx` at a source root, applied only when no query token matches the file name.
- [ ] 4.3 Test both penalties, including the token-match case where no penalty applies.
- [ ] 4.4 Re-run the held-out benchmark tasks and record Recall@5 against the pre-change value.

## 5. Verify

- [ ] 5.1 `npm run verify:release` passes from a clean tree.
- [ ] 5.2 GitHub Actions verification passes on Node 22, 24, and 26.
- [ ] 5.3 One live `fast_context_search` call confirms the new description is what the agent sees and the scope field appears on a real `no_match`.
- [ ] 5.4 Code Review Partner reviews this change against the proposal before merge.
