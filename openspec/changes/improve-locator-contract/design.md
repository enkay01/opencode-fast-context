# Design

## Context

The plugin is installed and used. One end-user session produced a written retro: one call, 872 ms, five of 335 candidates, correct top hit, two noisy results, and a clear line between what the tool is good at and what it is not. The tool description, the README opening, and the auto-invoke guidance all describe a question-answering product. The tool actually returns locations for another model to read.

The current `TOOL_DESCRIPTION` says "Find the files and line ranges in this repository that answer a code question." `README.md` line 3 says the same. The README then warns that quality parity is not established, which is a statement about the benchmark, not about any individual search.

## Goals

- A calling agent reads the tool description once and knows the tool's job and its limits.
- README front matter states what the tool does without hedging language.
- A `no_match` result says what was searched, so absence claims are bounded.
- The two observed noise classes are measurably down-weighted.

## Non-goals

- Proving absence. The tool returns locations; it does not enumerate the whole repository to certify that something does not exist.
- Changing the provider, ranking model, candidate budget, or climb level.
- Rewriting `BENCHMARK.md` or retracting its figures.
- Answering questions. That remains the main agent's job.

## Decisions

**Wording.** The tool is a locator. The description says it returns files and line ranges for the caller to read, that it does not answer the question itself, and that a negative result covers only the searched scope. The auto-invoke guidance keeps its routing purpose but drops phrasing that implies the tool resolves the task.

**Disclosure placement.** Measured figures and their method stay in `BENCHMARK.md`. `CHANGELOG.md` keeps its historical record. The README opening and the benchmark section state the numbers plainly and stop there. The warning block about experimental status and parity is removed from the front page; the requirement to disclose measurement limits is satisfied by `BENCHMARK.md` remaining linked and unedited.

**Searched scope.** `no_match` gains a `searched` object: candidate count, distinct files considered, and whether the deadline truncated discovery. This is additive; `complete` results carry the same field for symmetry. The field is bounded and cheap to compute from state the engine already holds.

**Precision penalties.** Two classes from the retro, both in `src/engine/discover.ts`:

- Non-source design exports: `.html` and `.css` under `designs/`, `design/`, or `artifacts/`, and `.html` beside a `.pen` or `.fig` file. Penalty mirrors the existing docs multiplier.
- Generic application entry files: `App.tsx`, `App.jsx`, `main.tsx`, `main.tsx`, `index.tsx` at a source root, when no query token matches the file name. These are the files that match almost any broad query and contributed the `src/App.tsx` false positive.

Both penalties are multipliers on the existing lexical score, not hard filters, so a query that genuinely targets those files still ranks them.

**Query-formulation guidance.** The retro found that a narrative query ranked a design doc above the spec that the user actually wanted. The description and README both state that concrete identifiers and filenames produce better results than narrative phrasing. This is documentation, not a query rewriter.

## Risks

Removing the parity warning could be read as a parity claim. The README states the measured speedup with its sample size and links the method; it does not assert quality parity.

The entry-file penalty could demote a file that is genuinely the answer. The penalty only applies when no query token matches the file name, and the benchmark's held-out tasks are re-run to confirm no recall regression.

A larger `no_match` payload slightly increases tool-output tokens. The scope object is fixed-shape and small.
