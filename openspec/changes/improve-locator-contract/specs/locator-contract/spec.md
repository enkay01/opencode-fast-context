## Purpose

Define how the retrieval tool presents itself to the calling agent: what it claims to do, what it refuses to claim, where measurement limits are disclosed, and which known noise classes are penalized.

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

### Requirement: Design-export and entry-file penalties

Discovery SHALL down-weight non-source design exports (`.html` or `.css` under a design, design, or artifacts directory) and generic application entry files (`App.tsx`, `App.jsx`, `main.tsx`, `index.tsx` at a source root) when no query token matches the file name. The penalties SHALL be score multipliers, not exclusions.

#### Scenario: Broad query over a React app

- WHEN a broad query ranks `src/App.tsx` with no query token in its file name
- THEN its score is multiplied by the entry-file penalty and it ranks below a file whose name matches the query

#### Scenario: Query targets the entry file

- WHEN the query contains a token matching an entry file's name
- THEN no entry-file penalty is applied
