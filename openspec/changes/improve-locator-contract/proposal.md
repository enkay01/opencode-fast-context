# Proposal

## Why

End-user testing scored `fast_context_search` 3/5 as a general question tool and 4/5 as a file locator. The tool found the three documents that mattered in one 872 ms call, but two of five returned results were noise, the tool could not report absence, and the README and tool description describe it as something that answers questions rather than something that pulls files into the agent's context.

Three specific defects came out of that session:

1. The README opens with experimental framing and a quality-parity warning. The project has one user, who runs it through agents. The warning text propagates into agent behaviour and hedges results that are already measured. Raw benchmark numbers are evidence and belong in `BENCHMARK.md`; the warning framing on the front page does not help.
2. The README and `TOOL_DESCRIPTION` say the tool finds line ranges "that answer a repository question". Windsurf Fast Context does not answer; it returns file paths and line ranges for the main agent to read. The current wording sets an expectation the tool does not meet and encourages agents to treat citations as a conclusion.
3. The tool's usage contract is not visible enough to the calling agent. The description and input schema are registered, but they do not say what the tool cannot do: it cannot prove that something is missing, and it should not be used to establish status or completeness. The retro session discovered this by failing, not by reading.

## What changes

- Reword the README opening, the tool description, and the auto-invoke guidance so the tool is described as retrieving locations into the agent's context, not as answering questions.
- Move experimental and quality-parity warning framing out of the README body. Keep measured figures and method in `BENCHMARK.md` and the `CHANGELOG.md` record; remove the hedging from the front page.
- Put the usage contract where the model reads it: the tool description states that the tool locates existing files and ranges, cannot prove absence, and should be paired with a directory listing or `git status` for status and completeness questions.
- Report the searched scope with `no_match`, so a negative result states what was covered instead of reading as a global claim.
- Align the provider relevance prompts in `src/providers/systemone.ts` and `src/providers/types.ts` with locator wording, so Jev judges whether a snippet is relevant context for a query rather than whether it "answers" the question.
- Give query examples using known domain names, symbols, and filenames when available; retain support for behavior queries that do not name target files.
- Verify the effective description, input schema, and invocation guidance delivered by a real isolated OpenCode session; generate an inspectable agent-contract document from the registered definitions.
- Evaluate the Jev prompt change on labelled code and design-document cases with stage traces and untouched acceptance queries. Add no discovery penalties or new result-selection threshold.

## Capabilities

### New capabilities

- `locator-contract`: the public and harness wording, schema visibility, searched-scope semantics, and evidence requirements for context retrieval. All requirements for this change live in this single capability.

## Impact

User-facing text changes in `README.md`, `src/tool.ts` (`TOOL_DESCRIPTION`), `src/guidance.ts` (`AUTO_INVOKE_GUIDANCE`), and the relevance prompts in `src/providers/systemone.ts` and `src/providers/types.ts`. Result shape gains a searched-scope field on `no_match`, which is additive for existing callers. Tests cover the new description wording, the scope field, and the aligned prompts.

The benchmark evidence is not deleted or restated as a parity claim. It moves out of the front-page narrative and stays in `BENCHMARK.md` with its method and limitations intact. `openspec/changes/ship-v1-release` records the original disclosure requirement; this change supersedes the README placement of that disclosure, not the underlying measurement.

This is the sole implementation proposal synthesizing the earlier technical proposal and the Project Partner/Product Design recommendations, including the user's rejection of precision penalties. No competing change or runtime implementation is added.
