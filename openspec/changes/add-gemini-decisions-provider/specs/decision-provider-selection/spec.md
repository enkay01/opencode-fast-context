# Spec Delta

## Purpose

Allow Fast Context users to choose a supported decision service for bounded repository ranking while preserving explicit credentials, source disclosure, and ordinary-search fallback.

## ADDED Requirements

### Requirement: Explicit provider selection
The plugin SHALL provide one TUI entrypoint to select `jev` or `gemini`, persist that selection in OpenCode storage, and allow switching without a restart. An optional `decisionProvider` value provides the initial selection; an unsupported value SHALL fail without sending source to either service. Without an initial or stored selection, no source SHALL be sent until the user selects a provider.
The stored selection SHALL be the authoritative choice for status and each new search, including after a reload or when another server instance handled the selection. A search SHALL snapshot that choice for its full run. Failure to read or persist it SHALL be reported as setup failure without claiming success or transmitting source to an unintended provider.

#### Scenario: Existing configuration
- **WHEN** a user has no `decisionProvider` option
- **THEN** `/fast-context provider` opens a provider picker and unselected searches ask for selection without outbound work

#### Scenario: Switch in the TUI
- **WHEN** the user selects Gemini, then Jev, then Gemini again
- **THEN** each subsequent search uses the chosen provider, both credentials remain separate, and the last choice survives a plugin reload

#### Scenario: Targeted Gemini onboarding
- **WHEN** an unselected user runs `/fast-context auth gemini`, enters a valid key, and completes setup
- **THEN** the key is stored under Gemini, Gemini becomes the persisted active provider, status reports Gemini, and the next search uses Gemini

#### Scenario: Cancelled or incomplete switch
- **WHEN** a user with an active provider starts switching to another provider but cancels key entry, validation fails, or selection persistence fails
- **THEN** the previous provider remains active, the UI does not claim the switch succeeded, and any already stored target key remains isolated for a retry

#### Scenario: Multiple instances and restart
- **WHEN** one TUI/server instance selects Gemini and another instance or a restarted plugin runs status and search
- **THEN** both observe the persisted Gemini choice rather than a stale setup-time selection; a routing or storage mismatch is surfaced as an error

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
Credential presence SHALL NOT be reported as a verified connection unless a source-free probe or provider request has succeeded. Provider availability errors SHALL be distinct from credential rejection.

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

### Requirement: Visible Fast Context connection state
The TUI SHALL show the active Fast Context provider and its current setup or connection state in the session sidebar, backed by server status. It SHALL distinguish no selection, selected without key, key present but unverified, a time-stamped verified connection, provider error, and RPC/status unavailable. The detailed status dialog SHALL agree with the sidebar and the provider used by the next search. Neither view SHALL expose key material, source excerpts, or raw provider error bodies.

#### Scenario: Key stored without active selection
- **WHEN** a Gemini key exists but no provider is selected
- **THEN** the sidebar says to choose a provider rather than showing Gemini connected, and an unselected search sends no source

#### Scenario: Connected provider and subsequent failure
- **WHEN** a source-free Gemini verification or Gemini search succeeds and a later request returns 401, 429, or times out
- **THEN** the sidebar first shows the verified Gemini observation, then shows the corresponding failure; a quota or timeout error does not label the key invalid or switch to Jev

#### Scenario: Status bridge unavailable
- **WHEN** the TUI cannot reach the server status RPC
- **THEN** the sidebar shows status unavailable rather than a cached connected claim

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
