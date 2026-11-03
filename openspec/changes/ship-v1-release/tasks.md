# Tasks

## 1. Freeze the release contract

- [x] 1.1 Merge or rebase the hill-climb work onto the release branch without changing the measured climb3 behavior. — Release branch contains the measured climb3 behavior; no code change was needed.
- [x] 1.2 Set version `0.1.0`, record the supported OpenCode 2 floor, and add repository, homepage, bugs, and public publish metadata. — `package.json` records version, runtime range, repository, homepage, bugs, and public publish config.
- [x] 1.3 Replace the OpenCode 1 SDK dependency and hand-written context types with the OpenCode 2 SDK entrypoint. — Entry point uses `Plugin.define` from `@opencode/plugin`; OpenCode 1 dependency and legacy entrypoint removed.
- [x] 1.4 Remove Clef, legacy entrypoints, and stage-selection controls from the public package surface. — Only the root export remains; Clef, legacy, and stage controls are absent from public config, exports, README, and keywords.

## 2. Add auto-invocation guidance

- [x] 2.1 Add `autoInvoke: "suggest" | "off"` with `suggest` as the default. — `autoInvoke` defaults to `suggest`.
- [x] 2.2 Register one replayable session-context transform with the bounded tool-selection instruction from the design. — One context hook adds the registered instruction; it only mutates `system`.
- [x] 2.3 Prove `off` adds no instruction and `suggest` does not call Jev before an ordinary tool invocation. — Tests prove `off` adds no hook and `suggest` performs zero fetches while preparing context.
- [x] 2.4 Test that repeated context transforms do not duplicate the instruction. — Replaying the hook leaves one instruction.
- [x] 2.5 Document that the setting guides model selection and is not hidden background execution. — README documents guidance versus hidden execution.

## 3. Close the provider boundary

- [x] 3.1 Make `TYPESAFE_API_KEY` the only public credential source and fail clearly when it is absent. — Missing `TYPESAFE_API_KEY` returns `fallback_required` without local ranking.
- [x] 3.2 Remove the public endpoint override and keep transport injection internal to tests. — Endpoint injection is internal to tests; `TYPESAFE_ENDPOINT` is ignored.
- [x] 3.3 Expand sensitive-file exclusions and add outbound content rejection/redaction before every provider request. — Exclusions expanded; private-key blocks rejected; token patterns redacted before provider requests.
- [x] 3.4 Sanitize provider errors so response bodies, headers, queries, excerpts, and credentials cannot reach output or logs. — Errors expose provider and status; request IDs are included only when they match `^[A-Za-z0-9-]{1,64}$`. Hostile-header test added.
- [x] 3.5 Add tests with dummy credentials and hostile provider responses; assert the credential and source marker are absent from logs, errors, snapshots, and tool output. — Dummy credentials and hostile responses are covered; final tool content and metadata, including fallback evidence, are redacted and tested.

## 4. Make installation one-shot

- [x] 4.1 Add `scripts/setup-opencode.mjs` and `npm run setup:opencode` with project and global scopes. — `scripts/setup-opencode.mjs` and `npm run setup:opencode` support project and global scopes.
- [x] 4.2 Preserve JSON/JSONC configuration and existing plugins, write atomically, pin the plugin target, and make reruns a no-op. — Setup parses JSONC, edits only the actual `plugins` entries, preserves surrounding text, re-parses the result, and is a no-op on rerun; comments and unrelated `fast-context` text are tested.
- [x] 4.3 Check prerequisites and credential presence without reading or printing the value. — Prerequisites and credential presence are checked without reading or printing the value.
- [x] 4.4 Verify the installed plugin ID and print an exact removal command. — Plugin identity is imported and verified; removal command is printed.
- [x] 4.5 Add concise human instructions and a root `AGENTS.md` one-shot instruction. — README and root AGENTS.md document human and agent setup.

## 5. Add release verification

- [x] 5.1 Add `verify:release` for typecheck, tests, build, package allowlist validation, and an OpenCode 2 load/tool-call smoke test. — `verify:release` runs typecheck, tests, build, mocked API smoke, real OpenCode 2.2.5 runtime load, allowlist, packed/tree/history scans, and clean-tree checks.
- [x] 5.2 Scan the current tree, Git history, and packed artifact for credential patterns. — Tracked tree, Git history, and packed tarball are scanned.
- [x] 5.3 Reject source maps containing absolute local paths or embedded source content. — Source maps disabled and rejected; absolute-path detection covers macOS, Linux, Windows drive paths, and UNC paths.
- [x] 5.4 Add CI for a clean clone and the supported runtime matrix. — CI workflow runs verify:release on Node 22, 24, and 26 with OpenCode installed; protected publish workflow added; first GitHub run pending.
- [x] 5.5 Add `CHANGELOG.md`, `SECURITY.md`, data disclosure, benchmark limitation, troubleshooting, and uninstall instructions. — CHANGELOG, SECURITY, data disclosure, benchmark limitation, troubleshooting, and removal documented.

## 6. Review, release, and install

- [ ] 6.1 Give the completed release candidate and this plan to Code Review Partner.
- [ ] 6.2 Fix every accepted release-blocking finding and obtain a final review with no unresolved blockers.
- [ ] 6.3 Confirm the worktree is clean and the packed artifact matches the reviewed commit.
- [ ] 6.4 Tag `v0.1.0` and publish through protected GitHub Actions with npm trusted publishing and provenance. If npm authentication is unavailable, publish the GitHub tag and use that exact tag; do not claim npm publication.
- [ ] 6.5 Install the exact reviewed release on the user's machine without storing or printing `TYPESAFE_API_KEY`.
- [ ] 6.6 Verify `opencode plugin list`, plugin ID `fast-context`, version, default auto-invocation guidance, and one real tool call against a non-sensitive repository.
- [ ] 6.7 Report commit, review result, release URL, install target, smoke result, and any remaining experimental limitations.

