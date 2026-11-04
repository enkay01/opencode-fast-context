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

The tool description SHALL state the tool's limits: it cannot prove that something is absent, a negative result covers only the searched scope, and status or completeness questions should be paired with a directory listing or `git status`. It SHALL advise that concrete identifiers and filenames rank better than narrative phrasing.

#### Scenario: Agent decides whether to call

- WHEN a model considers calling the tool to establish whether a change was completed
- THEN the description tells it to pair the result with a directory listing or `git status` rather than rely on the tool alone

### Requirement: Provider prompt alignment

The Jev relevance prompts in `src/providers/systemone.ts` and `src/providers/types.ts` SHALL ask whether a candidate is relevant context for the query. They SHALL NOT ask whether the candidate answers the query.

#### Scenario: Jev scores a design document

- WHEN a candidate is a design export that documents the behaviour the query is about
- THEN the prompt asks whether it is relevant context, so a document can score well without being read as an answer

### Requirement: Searched scope on negative results

A `no_match` result SHALL include the searched scope: the candidate count considered, the number of distinct files examined, and whether discovery was truncated by the deadline. The field SHALL also be present on `complete` results for a uniform shape.

#### Scenario: Candidate pool has no passing match

- WHEN ranking completes and no candidate reaches the match threshold
- THEN the result status is `no_match` and the payload reports how many candidates and distinct files were examined, plus truncation state

#### Scenario: Discovery hits the deadline

- WHEN the elapsed budget stops discovery before the pool is exhausted
- THEN the truncation flag is set so the caller can tell a bounded negative from a full negative

### Requirement: No scoring rule from one session

This change SHALL NOT alter discovery scoring in `src/engine/discover.ts`, and SHALL NOT add a file-type, entry-file, or top-N precision rule based on a single session's results. Relevance changes require stage traces and comparison cases where the affected file classes are the intended context.

#### Scenario: Relevance work resumes

- WHEN discovery candidates, Jev scores, and final selection are captured for representative queries
- THEN any proposed scoring rule is evaluated against cases where HTML, design artifacts, and entry files are the intended context as well as cases where they are not
