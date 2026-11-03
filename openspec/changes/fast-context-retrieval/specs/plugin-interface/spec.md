# Spec Delta

## Purpose

Integrates fast retrieval into OpenCode sessions with clean user interaction, non-intrusive progress updates, and cited context insertion.

## ADDED Requirements

### Requirement: OpenCode tool registration
The plugin SHALL register the `fast_context.search` tool in OpenCode sessions, accepting a natural language query and returning targeted source citations.

#### Scenario: Tool invocation by OpenCode agent
- **WHEN** the primary agent requests codebase location context
- **THEN** OpenCode exposes `fast_context.search` and dispatches the query to the retrieval engine

### Requirement: Non-intrusive progress reporting
The plugin SHALL report concise exploration progress to the user interface without dumping intermediate search command outputs into the primary conversation transcript.

#### Scenario: Progress indication during search
- **WHEN** the retrieval engine executes exploration turns
- **THEN** the interface displays an active status line indicating current turn and parallel query count while keeping raw grep logs hidden

### Requirement: Compact citation formatting
The plugin SHALL format returned results as compact file and line citations with brief contextual excerpts for the primary agent.

#### Scenario: Context insertion for main agent
- **WHEN** retrieval completes with identified code spans
- **THEN** the plugin returns formatted lines containing file paths, line ranges, and short snippets directly usable for code editing

### Requirement: Graceful fallback
The plugin SHALL catch retrieval engine timeouts and decision model errors, falling back to OpenCode built-in search tools without interrupting the user session.

#### Scenario: Upstream model error fallback
- **WHEN** the decision model service returns a connection error or exceeds the timeout threshold
- **THEN** the plugin logs a warning and falls back to standard OpenCode file search
