# Spec Delta

## Purpose

Enables secure capture, host-level persistence in OpenCode's native integration credential store (SQLite database), and deterministic resolution precedence for TypeSafe / Jev credentials across interactive and non-interactive OpenCode sessions without requiring source repository access, custom credential files, or manual shell export.

## ADDED Requirements

### Requirement: Credential resolution precedence

The system SHALL resolve the TypeSafe / Jev API credential in a deterministic hierarchy: explicit process environment variable first, followed by OpenCode's integration credential store, and finally an interactive prompt when running in an interactive TUI session.

#### Scenario: Environment variable takes precedence
- **WHEN** `TYPESAFE_API_KEY` is defined in `process.env`
- **THEN** the plugin uses the environment key without resolving from OpenCode's integration credential store or presenting a prompt

#### Scenario: Fallback to OpenCode integration credential store
- **WHEN** `TYPESAFE_API_KEY` is not present in `process.env` but an active credential exists for the Fast Context integration in OpenCode's database
- **THEN** the plugin resolves the credential via `ctx.integration.connection.active` and `ctx.integration.connection.resolve` without prompting the user

#### Scenario: Missing credential triggers interactive prompt
- **WHEN** the credential is absent from both `process.env` and OpenCode's integration credential store in an interactive TUI session
- **THEN** the plugin triggers the masked TUI credential prompt before proceeding with retrieval

### Requirement: Interactive TUI credential prompt

The system SHALL provide a focused, modal TUI dialog in OpenCode when a credential is required but not configured, or when a stored database credential fails authentication (e.g., expired or invalid key). The input field MUST visually mask secret characters, and the dialog SHALL clearly state that the credential is saved in OpenCode's credential store.

#### Scenario: User submits token
- **WHEN** the user enters a non-empty token into the prompt and confirms
- **THEN** the token is validated against the TypeSafe endpoint, persisted to OpenCode's integration credential store via `ctx.integration.connect.key`, and used for the active retrieval request

#### Scenario: User enters invalid or expired token
- **WHEN** the user submits a token that fails authentication verification with the provider
- **THEN** the prompt displays an inline validation error and allows the user to re-enter the token without closing the dialog or saving the invalid token

#### Scenario: User dismisses prompt
- **WHEN** the user cancels or closes the dialog without entering a key
- **THEN** the retrieval operation returns `fallback_required` without writing any credential to OpenCode's database

### Requirement: On-demand and trigger-based credential capture

The TUI prompt SHALL trigger both automatically on the first unauthenticated search or stored-credential authentication failure in an interactive session, and on demand via dedicated slash and palette commands (`/fast-context auth`).

#### Scenario: First search triggers login
- **WHEN** an unauthenticated user executes a search query in an interactive session
- **THEN** the plugin presents the credential prompt modal before running the search

#### Scenario: Expired stored key triggers re-prompt
- **WHEN** a credential resolved from OpenCode's integration credential store returns an authentication failure (HTTP 401/403) from Jev
- **THEN** the plugin removes the invalid credential record from OpenCode's credential store and prompts the user to enter a replacement key

#### Scenario: Invalid environment key does not purge stored credential
- **WHEN** a credential provided via `process.env.TYPESAFE_API_KEY` returns an authentication failure (HTTP 401/403) from Jev
- **THEN** the plugin does not delete any credential stored in OpenCode's database and reports the authentication failure

### Requirement: OpenCode integration credential store persistence

The system SHALL persist credentials exclusively through OpenCode's integration credential API (`ctx.integration`) backed by OpenCode's SQLite database. The plugin SHALL NOT create custom credential files (such as `credentials.json`), SHALL NOT implement custom OS Keychain bridges or custom filesystem permission/ACL commands (`icacls`), and SHALL delegate database file permissions to OpenCode (`0o600` on Unix, inherited user-profile ACLs on Windows).

#### Scenario: Persistence across OpenCode restarts
- **WHEN** a credential is saved through the Fast Context integration
- **THEN** OpenCode stores it in its SQLite `credential` table and resolves it across subsequent interactive and background service launches on the same server host

#### Scenario: Replacement cleans up prior records
- **WHEN** a user updates or replaces an existing stored credential
- **THEN** the new credential is connected and activated and any previous Fast Context credential records in OpenCode's database are removed so stale records do not accumulate

#### Scenario: Workspace isolation
- **WHEN** credential storage occurs
- **THEN** no secret material is written to `opencode.jsonc`, custom config files, `.env*`, repository files, or execution logs

### Requirement: Headless and non-interactive execution

The system SHALL detect non-interactive execution contexts (such as background daemons without a connected TUI, automated subagents, or CI) and MUST NOT block on user input when credentials are missing.

#### Scenario: Headless execution without credential
- **WHEN** `fast_context_search` is called without an available credential and no interactive TUI session can prompt the user
- **THEN** it immediately returns `status: fallback_required` with an explanatory message directing the user to set `TYPESAFE_API_KEY` or run the interactive auth command in OpenCode

### Requirement: Credential lifecycle management

The plugin SHALL provide explicit commands to inspect credential configuration status, update/replace the stored token, or revoke the stored token. Secret values SHALL NOT be echoed or logged in plaintext.

#### Scenario: Inspect credential status
- **WHEN** the user executes the credential status command
- **THEN** the system reports whether a credential is active and its source (`process.env.TYPESAFE_API_KEY` vs. OpenCode integration credential store) without revealing the key

#### Scenario: Revoke stored credential
- **WHEN** the user executes the credential revoke command
- **THEN** all Fast Context credential records are removed from OpenCode's credential store via the credential removal API and confirmation is displayed to the user
