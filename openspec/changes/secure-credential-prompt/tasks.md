# Tasks

## 1. OpenCode Integration Credential Store & Live Validation

- [x] 1.1 Implement Fast Context integration registration and credential store module (`src/credentials.ts`) using OpenCode's `ctx.integration` API (`transform`, `connect.key`, `connection.active`, `connection.resolve`) and client/server `credential.remove` cleanup for replacement and revocation; verify tests cover save, resolve across restarts, replacement without duplicate records, and revoke.
- [x] 1.2 Implement live credential verification probe to the TypeSafe / Jev endpoint to test key validity before persisting; verify unit tests cover valid key, 401/403 unauthorized, and timeout/network error handling.
- [x] 1.3 Update `src/config.ts` to support asynchronous credential resolution following the precedence order (`process.env.TYPESAFE_API_KEY` > OpenCode integration credential store > missing), preserving stored database credentials if an explicit `process.env` override fails; verify unit tests cover each precedence tier and source isolation.

## 2. Interactive TUI Prompt & Command Integration

- [x] 2.1 Implement masked TUI dialog prompt and server-to-TUI RPC coordination (`@opencode/plugin/tui`) with live validation feedback; verify prompt presentation, inline validation failure, and cancellation via test mock.
- [x] 2.2 Wire automatic prompt triggering on first unauthenticated search and on expired stored key (401/403) failure; verify integration test triggers prompt on missing and expired stored credentials.
- [x] 2.3 Add command palette / slash commands for credential lifecycle (`/fast-context auth`, `/fast-context auth status`, `/fast-context auth revoke`) wired to OpenCode's integration credential store and removal API; verify command execution and user feedback.
- [x] 2.4 Implement non-interactive and headless environment guardrails returning structured `fallback_required` without blocking when no TUI client can prompt; verify headless tests pass.

## 3. Documentation & Verification

- [x] 3.1 Update `README.md` and `docs/agent-contract.md` to document the new onboarding flow, TUI prompt, and OpenCode integration credential store persistence; verify `npm run contract:check` passes.
- [x] 3.2 Run full release verification suite (`npm run verify:release`) and verify clean working tree and passing CI checks.
