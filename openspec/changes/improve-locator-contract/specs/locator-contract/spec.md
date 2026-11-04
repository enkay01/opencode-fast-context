## Purpose

Define how the retrieval tool presents itself to the calling agent: what it claims to do, what it refuses to claim, where measurement limits are disclosed, and what a negative result reports.

## ADDED Requirements

### Requirement: Locator positioning

The tool description, the README opening, and the auto-invoke guidance SHALL describe the tool as returning files and line ranges for the caller to read. They SHALL NOT describe the tool as answering, resolving, or concluding the caller's question.

#### Scenario: An agent reads the tool description

- WHEN a model inspects `fast_context_search` before calling it
- THEN the description states that the tool returns locations to read and does not itself answer the question

#### Scenario: README opening

- WHEN a reader opens `README.md`
- THEN the first paragraph describes file and line retrieval with no experimental or parity warning in it

### Requirement: Measurement disclosure placement

Measured benchmark figures SHALL remain in `BENCHMARK.md` with their method, sample size, and limitations, linked from `README.md`. `CHANGELOG.md` SHALL retain its historical record. Warning framing about experimental status and unestablished quality parity SHALL NOT appear in the README opening or the benchmark summary.

#### Scenario: Benchmark section

- WHEN a reader reaches the README benchmark section
- THEN it states the measured latency figures with their sample sizes and links `BENCHMARK.md` for method and limits, with no parity warning block

#### Scenario: Source of record

- WHEN `BENCHMARK.md` is read after this change
- THEN its method, raw figures, and stated limitations are unchanged

### Requirement: Usage contract in the tool description

The tool description SHALL describe retrieving relevant files and bounded excerpts, and direct status or absence tasks to current filesystem or version-control evidence. It SHALL recommend known domain names, symbols, or filenames when available while supporting natural-language queries without naming the target file.

#### Scenario: Agent decides whether to call

- WHEN a model considers calling the tool to establish whether a change was completed
- THEN the description tells it to pair the result with a directory listing or `git status` rather than rely on the tool alone

### Requirement: Provider prompt alignment

The Jev relevance prompts in `src/providers/systemone.ts` and `src/providers/types.ts` SHALL ask whether a candidate is relevant context for the query. They SHALL NOT ask whether the candidate answers the query.

#### Scenario: Jev scores a design document

- WHEN a candidate is a design export that documents the behaviour the query is about
- THEN the prompt asks whether it is relevant context, so a document can score well without being read as an answer

### Requirement: Searched scope on negative results

Every result SHALL include searched scope: candidate windows passed into relevance scoring, distinct files among those candidates, and whether discovery stopped early because its deadline expired. Before discovery these counts SHALL be zero. Failures after discovery SHALL preserve observed counts. Scope SHALL NOT imply exhaustive coverage or successful provider scoring. Existing timeout statuses SHALL be preserved.

#### Scenario: Candidate pool has no passing match

- WHEN ranking completes and no candidate reaches the match threshold
- THEN the result status is `no_match` and the payload reports how many candidates and distinct files were examined, plus truncation state

#### Scenario: Discovery hits the deadline

- WHEN the elapsed budget stops discovery before the pool is exhausted
- THEN the truncation flag is set and the status remains partial or fallback_required as appropriate; no global absence claim is made

#### Scenario: Retrieval completes

- WHEN the result status is complete
- THEN the contract describes completion of retrieval, without claiming project completeness or exhaustive context

### Requirement: No scoring rule from one session

This change SHALL NOT alter discovery scoring in `src/engine/discover.ts`, and SHALL NOT add a file-type, entry-file, or top-N precision rule based on a single session's results. Relevance changes require stage traces and comparison cases where the affected file classes are the intended context.

#### Scenario: Relevance work resumes

- WHEN discovery candidates, Jev scores, and final selection are captured for representative queries
- THEN any proposed scoring rule is evaluated against cases where HTML, design artifacts, and entry files are the intended context as well as cases where they are not

### Requirement: Agent-visible contract verification

The implementation SHALL retain query/maxFiles input compatibility and export canonical definitions used by both registration and generated docs/agent-contract.md. CI SHALL detect drift. A real isolated supported OpenCode runtime check SHALL verify the effective tool description, JSON Schema, and invocation guidance through supported inspection or a captured fake model request.

#### Scenario: Invocation guidance is off

- WHEN autoInvoke is off in the runtime check
- THEN the tool description and schema remain available and extra invocation guidance is absent

#### Scenario: Invocation guidance is suggest

- WHEN the session prepares context repeatedly with autoInvoke suggest
- THEN guidance appears once and no Jev request occurs before a visible tool call

#### Scenario: Schema is delivered

- WHEN the runtime check observes the model's tool contract
- THEN query is required, maxFiles is optional with integer bounds 1 through 20, extra properties are rejected, and maxFiles is described as a ceiling

### Requirement: Prompt-change evaluation

The relevance prompt change SHALL be compared against the existing prompt on mixed code/document fixtures labelled before tuning. Evaluation SHALL include useful HTML/design artifacts and entry files not named in queries, stage traces, precision among returned files, Recall@5, returned count, and latency. Acceptance queries SHALL remain untouched during tuning, and useful-file recall SHALL be preserved. Prior development tasks SHALL NOT be described as fresh held-out evidence.

#### Scenario: Prompt rewrite is evaluated

- WHEN Jev is asked to judge relevant context instead of answering a question
- THEN the comparison reports its effect on useful-file retrieval and distractors with the evaluation transport and model identified

### Requirement: Implementation review

The implementation SHALL pass release verification and independent Code Review Partner review against this single change before merge. Approval of this proposal SHALL NOT itself trigger publication or local installation changes.

#### Scenario: Work is handed to SWE

- WHEN implementation begins
- THEN improve-locator-contract is the sole change used for implementation and review
