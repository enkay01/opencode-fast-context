## Purpose

Give OpenCode a bounded repository localization tool that returns checked source locations and supports interchangeable Jev and Clef decision providers.

## ADDED Requirements

### Requirement: Verified evidence
The tool SHALL accept a query and return a versioned result with explicit status and repository-relative file paths with valid inclusive line ranges. It SHALL verify evidence freshness and enforce configured output limits.

#### Scenario: File changes during retrieval
- WHEN a selected file changes before evidence is returned
- THEN the engine revalidates its ranges and drops or refreshes stale evidence

### Requirement: Interchangeable decision providers
The engine SHALL support separately configured Jev and Clef providers using equivalent relevance questions over supplied candidates. It SHALL validate provider responses and report actual provider identity and usage availability.

#### Scenario: Provider returns unknown candidate
- WHEN a response selects an id absent from the supplied candidates
- THEN the engine rejects that selection and returns valid partial evidence or fallback_required

### Requirement: Bounded execution
Retrieval SHALL enforce configured concurrency, wave, input, output, and elapsed-time budgets. Cancellation SHALL stop outstanding local work and prevent further provider requests.

#### Scenario: Deadline expires
- WHEN the total deadline expires during scoring
- THEN the tool stops work and returns partial evidence or fallback_required with a timeout reason

### Requirement: Repository access boundaries
Retrieval SHALL enforce host access permissions, ignore rules, and worktree boundaries before reading or transmitting source. It SHALL reject outside-root symlink targets and exclude credentials from logs and provider state.

#### Scenario: Outside symlink
- WHEN a candidate resolves through a symlink outside the allowed worktree
- THEN the tool excludes it before reading bytes or calling a provider

### Requirement: Ordinary search remains available
The plugin SHALL leave built-in search tools available and return an explicit fallback reason on provider failure. It SHALL NOT silently switch providers or claim fallback completion as successful fast retrieval.

#### Scenario: Provider unavailable
- WHEN the configured provider fails
- THEN the caller receives fallback_required or partial with a failure reason and can continue with ordinary OpenCode search
