# Design

## Context

The plugin is installed and used. One end-user session produced a written retro: one call, 872 ms, five of 335 candidates, correct top hit, two noisy results, and a clear line between what the tool is good at and what it is not. The tool description, the README opening, and the auto-invoke guidance all describe a question-answering product. The tool actually returns locations for another model to read.

The current `TOOL_DESCRIPTION` says "Find the files and line ranges in this repository that answer a code question." `README.md` line 3 says the same. The README then warns that quality parity is not established, which is a statement about the benchmark, not about any individual search.

## Goals

- A calling agent reads the tool description once and knows the tool's job and its limits.
- README front matter states what the tool does without hedging language.
- A `no_match` result says what was searched, so absence claims are bounded.

## Non-goals

- Proving absence. The tool returns locations; it does not enumerate the whole repository to certify that something does not exist.
- Changing the provider, ranking model, candidate budget, or climb level.
- Rewriting `BENCHMARK.md` or retracting its figures.
- Answering questions. That remains the main agent's job.

## Decisions

**Wording.** The tool is a locator. The description says it returns files and line ranges for the caller to read, that it does not answer the question itself, and that a negative result covers only the searched scope. The auto-invoke guidance keeps its routing purpose but drops phrasing that implies the tool resolves the task.

**Disclosure placement.** Measured figures and their method stay in `BENCHMARK.md`. `CHANGELOG.md` keeps its historical record. The README opening and the benchmark section state the numbers plainly and stop there. The warning block about experimental status and parity is removed from the front page; the requirement to disclose measurement limits is satisfied by `BENCHMARK.md` remaining linked and unedited.

**Searched scope.** `no_match` gains a `searched` object: candidate count, distinct files considered, and whether the deadline truncated discovery. This is additive; `complete` results carry the same field for symmetry. The field is bounded and cheap to compute from state the engine already holds.

**Provider prompts.** The same "answers the question" framing appears inside the Jev prompts at `src/providers/systemone.ts` line 125 and `src/providers/types.ts` line 57. These are the questions Jev actually scores against, so they are the most direct place the contract shows up. They get the same rewrite: judge whether the snippet is relevant context for the query, not whether it answers it.

**Relevance diagnosis, not rules.** The retro produced two irrelevant results for one query, `designs/site-vision-exploration.html` and `src/App.tsx`. No file-type or entry-file penalty is adopted on that evidence. Such a penalty would remove candidates from the 24-file Jev pool before the ranking model can judge them, and the exemption would miss the real case of an agent looking for "opening animation" that needs `App.tsx` or a design HTML file without naming either. When relevance work resumes, the order is: capture discovery candidates, Jev scores, and final selection to find where distractors enter; include queries where HTML, design artifacts, and entry files are the intended context; test whether the prompt rewrite alone moves those results. Returning fewer results stays off the list unless measurements show weak candidates filling the requested count. `maxFiles` stays a ceiling.

**Query-formulation guidance.** The retro found that a narrative query ranked a design doc above the spec that the user actually wanted. The description and README both state that concrete identifiers and filenames produce better results than narrative phrasing. This is documentation, not a query rewriter.

## Risks

Removing the parity warning could be read as a parity claim. The README states the measured speedup with its sample size and links the method; it does not assert quality parity.

The prompt rewrite changes what Jev is asked and could shift ranking. The held-out benchmark tasks are re-run after the change to confirm Recall@5 does not fall below the pre-change value. Discovery scoring is untouched, so the candidate pool is unchanged.

A larger `no_match` payload slightly increases tool-output tokens. The scope object is fixed-shape and small.
