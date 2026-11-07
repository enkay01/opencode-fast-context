# Proposal

## Why

When installing `opencode-fast-context` as a standalone plugin (e.g., via `opencode plugin add` or pre-built distribution) without cloning the source repository, users have no access to development setup scripts and are instructed to manually export `TYPESAFE_API_KEY` in their shell. This introduces steep onboarding friction, frequently breaks for desktop-launched or background-service OpenCode sessions where shell exports do not propagate, and risks leaking API keys into unencrypted shell profiles, history, or dotfiles.

## What Changes

- **Interactive TUI Prompt**: Introduce a small, focused TUI dialog within OpenCode that prompts the user for their TypeSafe / Jev API token with masked input when the plugin is invoked without an existing credential.
- **OpenCode Integration Credential Store Persistence**: Register a dedicated Fast Context integration (`ctx.integration.transform`) and persist validated tokens in OpenCode's native SQLite integration credential store via `ctx.integration.connect.key` and `ctx.integration.connection.active` / `resolve`. This eliminates any bespoke `credentials.json` file or custom filesystem permission/ACL management (`chmod` / `icacls`), delegating storage and host file permissions directly to OpenCode's database layer (`0o600` on Unix, inherited user-profile ACLs on Windows).
- **Resolution Precedence**: Formulate a deterministic credential hierarchy:
  1. Process environment (`TYPESAFE_API_KEY`) for ephemeral CI/agent override;
  2. OpenCode's integration credential store (`ctx.integration.connection.active` -> `resolve`) for persistent host authentication;
  3. Interactive TUI prompt (if in an interactive TUI session);
  4. Graceful `fallback_required` with actionable instructions (if headless, non-interactive, or dismissed).
- **Credential Lifecycle Commands & Replacement Hygiene**: Provide user-invocable commands (`/fast-context auth`) to inspect authentication status, update/replace the token, or revoke/clear it through the client/server credential API (`credential.list` / `credential.remove`), ensuring repeated `connect.key` calls do not leave orphaned credential records behind.
- **Headless & Agent Guardrails**: Non-interactive runs (background services, CI, autonomous subagent calls) must never block or hang waiting on stdin; if unauthenticated, they return structured `fallback_required` directing the human user to authenticate via the interactive TUI or environment.

## Capabilities

### New Capabilities

- `credential-management`: Interactive TUI capture, OpenCode integration credential store persistence, resolution precedence, and lifecycle management (status, update, revoke) for Jev / TypeSafe API tokens without requiring repository access, custom credential files, or shell environment modifications.

### Modified Capabilities

None.

## Impact

- **Core Engine & Config**: `src/config.ts` and `src/tool.ts` will support asynchronous credential resolution from OpenCode's integration credential store alongside `process.env`.
- **Plugin Entry & TUI Hooks**: Registers the Fast Context integration (`ctx.integration`), TUI prompts, and command palette handlers using `@opencode/plugin` server and TUI APIs.
- **Dependencies & Portability**: Zero custom file permission or native OS keychain code; runs cleanly across macOS, Linux, and Windows using OpenCode's built-in SQLite database.
- **Security Surface**: Tokens are stored in OpenCode's server-managed database and never written to project files, `opencode.jsonc`, custom JSON files, version control, or execution logs.
