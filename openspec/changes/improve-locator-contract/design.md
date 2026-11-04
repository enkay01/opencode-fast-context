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

**Searched scope.** Every result gains a small `searched` object derived from observed pipeline state, with the precise definitions below. The field is additive.

**Provider prompts.** The same "answers the question" framing appears inside the Jev prompts at `src/providers/systemone.ts` line 125 and `src/providers/types.ts` line 57. These are the questions Jev actually scores against, so they are the most direct place the contract shows up. They get the same rewrite: judge whether the snippet is relevant context for the query, not whether it answers it.

**Relevance diagnosis, not rules.** The retro produced two irrelevant results for one query, `designs/site-vision-exploration.html` and `src/App.tsx`. No file-type or entry-file penalty is adopted on that evidence. Such a penalty would remove candidates from the 24-file Jev pool before the ranking model can judge them, and the exemption would miss the real case of an agent looking for "opening animation" that needs `App.tsx` or a design HTML file without naming either. When relevance work resumes, the order is: capture discovery candidates, Jev scores, and final selection to find where distractors enter; include queries where HTML, design artifacts, and entry files are the intended context; test whether the prompt rewrite alone moves those results. Returning fewer results stays off the list unless measurements show weak candidates filling the requested count. `maxFiles` stays a ceiling.

**Query-formulation guidance.** The retro suggests that including the game's domain terms could improve the query. The description and README give concrete examples without a blanket claim that narrative queries rank worse. This is documentation, not a query rewriter.

Advise including known domain names, symbols, filenames, and the intended task when available. Natural-language behavior queries remain supported; naming the target file is not a retrieval prerequisite, and the single retro does not prove a general ordering between query styles.

## Canonical harness contract

README opening: "Fast Context pulls relevant repository files and excerpts into your OpenCode agent's context."

Registered tool description:

> Retrieve relevant repository files and line ranges into context for the current task. Use a focused query with domain names, symbols, or behavior; results contain ranked paths and bounded excerpts. Read the selected ranges when more context is needed. For current project status or a missing artifact, also inspect the relevant directories and version-control state. On no_match or fallback_required, continue with ordinary search.

The schema keeps `query` required, `maxFiles` optional and bounded from 1 to 20, and rejects extra properties. Describe query as the task, concepts, or identifiers whose relevant files should be retrieved. `maxFiles` is a ceiling, not a promise to fill slots. This change does not modify the existing selection threshold.

Use the same exported definitions for registration and generated `docs/agent-contract.md`; check document drift in CI. Consumer agents receive the contract through OpenCode registration and the context hook, not by assuming the repository README or AGENTS.md is loaded.

Keep autoInvoke suggest/off behavior. Suggest adds the locator guidance once and makes no provider request before a visible tool call. Off removes only that extra guidance; the registered description and schema remain available.

## Scope and caller workflow

Define `searched.candidates` as the actual candidate windows passed into relevance scoring, `searched.files` as distinct files among those candidates, and `searched.truncated` as discovery stopped early because its deadline expired. Do not present these as counts of every repository file or successfully scored candidates. Compute scope from the observed pipeline state; do not rescan to infer coverage. Include the object on complete, no_match, partial, and fallback_required; use zeros before discovery, and preserve actual counts after a failure.

Preserve existing status behavior: discovery timeout remains partial or fallback_required as appropriate, never a full negative. `complete` describes retrieval completion, not project completeness. `no_match` means no relevant evidence was selected in this search, not that no file exists. A false truncation flag does not certify exhaustive repository coverage.

For planning, retrieve material, read useful ranges, then inspect current git state and relevant change/export directories. Encrypted artifact contents require a suitable reader. Filename listings do not establish the contents of those files. These checks belong to the caller's workflow; the plugin does not run git status for every query.

## Evaluation and runtime acceptance

Before rewriting Jev prompts, fix relevant-file labels on a distributable mixed code/document fixture. Include HTML, design artifacts, and entry files as useful targets and as distractors, including queries that do not name the files. Record the baseline and candidate discovery admission, Jev scores, and selection. Report precision among returned files, Recall@5, returned counts, and latency. Preserve useful-file recall on untouched acceptance paraphrases; report observed changes without a general performance claim. Existing benchmark tasks remain regression material, not fresh held-out evidence. Use mocks for deterministic boundary tests and report any live model evaluation separately.

Extend the real OpenCode runtime smoke with isolated configuration and synthetic source. Verify the effective description and JSON Schema through a supported inspection surface or captured request to a fake model transport. Confirm suggest/off behavior and emit sanitized contract evidence with the runtime version. A plugin import or one successful tool call alone does not prove what the model saw. This check requires no production key or Jev request.

## Delivery

Implement contract wording, schema documentation, and runtime verification first; add scope reporting and compare the prompt change against the fixed fixtures next. Run release verification and obtain Code Review Partner review against this single proposal before merge. Release and installation updates are separate actions after implementation approval. Distribution stays on GitHub.

## Risks

Removing the parity warning could be read as a parity claim. The README states the measured speedup with its sample size and links the method; it does not assert quality parity.

The prompt rewrite changes what Jev is asked and could shift ranking. Compare it on the fixed mixed-material corpus and untouched acceptance queries before accepting it. Discovery scoring stays unchanged.

A larger `no_match` payload slightly increases tool-output tokens. The scope object is fixed-shape and small.
