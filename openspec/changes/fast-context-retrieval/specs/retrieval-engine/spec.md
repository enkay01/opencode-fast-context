# Spec Delta

## Purpose

Executes bounded multi-turn codebase exploration using parallel grep, glob, and read tools guided by Jev or Clef decision primitives.

## ADDED Requirements

### Requirement: Bounded exploration loop
The retrieval engine SHALL execute up to 4 sequential exploration turns and up to 8 parallel tool calls per turn over local grep, glob, and read utilities.

#### Scenario: Turn and fan-out limits respected
- **WHEN** a search query requires multi-turn investigation across multiple modules
- **THEN** the engine issues at most 8 parallel tool calls in any single turn and terminates exploration after at most 4 turns

### Requirement: Decision-guided search routing
The engine SHALL use Jev or Clef decision primitives to evaluate search candidates and select the next tool actions without free-form text generation.

#### Scenario: Pruning irrelevant search branches
- **WHEN** initial grep returns matches across both test fixtures and core source files
- **THEN** the decision primitive ranks core source files higher and schedules subsequent read calls only on high-confidence locations

### Requirement: Structured location output
The engine SHALL terminate by returning a structured list of relevant file paths and line ranges with confidence scores.

#### Scenario: Successful target resolution
- **WHEN** exploration identifies the target implementation in a source file
- **THEN** the engine outputs the exact file path and 1-indexed start and end line numbers without embedding full file contents
