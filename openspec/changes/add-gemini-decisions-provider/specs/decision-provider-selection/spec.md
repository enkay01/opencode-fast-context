# Spec Delta

## Purpose

Allow Fast Context users to choose a supported decision service for bounded repository ranking while preserving explicit credentials, source disclosure, and ordinary-search fallback.

## ADDED Requirements

### Requirement: Explicit provider selection
The plugin SHALL provide one TUI entrypoint to select `jev` or `gemini`, persist that selection in OpenCode storage, and allow switching without a restart. An optional `decisionProvider` value provides the initial selection; an unsupported value SHALL fail without sending source to either service. Without an initial or stored selection, no source SHALL be sent until the user selects a provider.

#### Scenario: Existing configuration
- **WHEN** a user has no `decisionProvider` option
- **THEN** `/fast-context provider` opens a provider picker and unselected searches ask for selection without outbound work

#### Scenario: Switch in the TUI
- **WHEN** the user selects Gemini, then Jev, then Gemini again
- **THEN** each subsequent search uses the chosen provider, both credentials remain separate, and the last choice survives a plugin reload

#### Scenario: Select Gemini
- **WHEN** `decisionProvider` is `gemini`
- **THEN** searches use Gemini Decision 1 and report `gemini` and the model identifier in the search result

#### Scenario: Unsupported selection
- **WHEN** `decisionProvider` is neither `jev` nor `gemini`
- **THEN** the search returns an actionable configuration failure without transmitting a query or excerpt

### Requirement: Provider-specific credential isolation
The plugin SHALL resolve only the selected provider's credential from its environment variable, then its separate OpenCode credential entry, then an interactive masked prompt; it MUST NOT send a credential to another provider.

#### Scenario: Gemini environment key
- **WHEN** Gemini is selected and `GEMINI_API_KEY` is present
- **THEN** the plugin uses that key without consulting a stored Gemini key or TypeSafe key

#### Scenario: Gemini stored key
- **WHEN** Gemini is selected, `GEMINI_API_KEY` is absent, and a Gemini credential is stored
- **THEN** the plugin uses the stored Gemini credential without consulting the TypeSafe credential

#### Scenario: Missing selected credential
- **WHEN** Gemini is selected without a Gemini credential and an interactive TUI is available
- **THEN** a masked prompt identifies Google and offers to verify and store a Gemini key before the search

#### Scenario: Headless missing credential
- **WHEN** Gemini is selected without a Gemini credential and no interactive TUI is available
- **THEN** the search promptly returns `fallback_required` with Gemini-specific setup guidance

### Requirement: Provider-specific credential lifecycle
The plugin SHALL validate submitted Gemini credentials against Google's API before storing them, identify the selected provider in status and authentication UI, and limit credential replacement, revocation, and rejection cleanup to that provider's stored entries.

#### Scenario: Invalid submitted Gemini key
- **WHEN** Google rejects a submitted key during validation
- **THEN** the key is not stored and the masked prompt allows correction

#### Scenario: Stored Gemini key rejected
- **WHEN** the selected Gemini provider returns HTTP 401 or 403 for its stored key
- **THEN** the stale Gemini record is discarded and an interactive session can submit a replacement; TypeSafe records are unaffected

#### Scenario: Environment Gemini key rejected
- **WHEN** Google rejects `GEMINI_API_KEY` with HTTP 401 or 403
- **THEN** the plugin reports that environment-key failure and does not erase or silently substitute any stored key

#### Scenario: Revoke Gemini key
- **WHEN** the user revokes the selected Gemini credential
- **THEN** stored Gemini records are removed and stored TypeSafe records are retained

### Requirement: Equivalent bounded retrieval contract
The Gemini provider SHALL score only candidates approved by the existing outbound filter, return finite relevance probabilities between 0 and 1 for supplied candidate IDs, honor cancellation and request deadlines, and preserve the tool's statuses, evidence limits, and fallback behavior.

#### Scenario: Valid Gemini ranking
- **WHEN** Gemini returns valid answers for approved candidate excerpts
- **THEN** the tool ranks checked evidence and reports input and output token usage when available

#### Scenario: Malformed, blocked, or unavailable response
- **WHEN** Gemini returns malformed answers, blocks input, times out, or is rate-limited
- **THEN** the tool returns valid partial evidence or `fallback_required` with a safe reason and does not silently switch to Jev

#### Scenario: Calibration
- **WHEN** Gemini determines whether the best result merits `no_match`
- **THEN** it uses a threshold calibrated for Gemini rather than assuming Jev's threshold is interchangeable

### Requirement: Source disclosure
The plugin SHALL identify Google as the recipient of the bounded query and source excerpts when Gemini is selected and document the materially different free-tier and paid-service data-use terms before recommending the option for confidential repositories.

#### Scenario: User reviews Gemini configuration
- **WHEN** a user reads the Gemini setup guidance or enters a Gemini key in the TUI
- **THEN** the guidance identifies the destination and directs the user to the applicable data-use terms
