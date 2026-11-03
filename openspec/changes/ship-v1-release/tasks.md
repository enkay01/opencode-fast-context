# Tasks

## 1. Freeze the release contract

- [ ] 1.1 Merge or rebase the hill-climb work onto the release branch without changing the measured climb3 behavior.
- [ ] 1.2 Set version `0.1.0`, record the supported OpenCode 2 floor, and add repository, homepage, bugs, and public publish metadata.
- [ ] 1.3 Replace the OpenCode 1 SDK dependency and hand-written context types with the OpenCode 2 SDK entrypoint.
- [ ] 1.4 Remove Clef, legacy entrypoints, and stage-selection controls from the public package surface.

## 2. Add auto-invocation guidance

- [ ] 2.1 Add `autoInvoke: "suggest" | "off"` with `suggest` as the default.
- [ ] 2.2 Register one replayable session-context transform with the bounded tool-selection instruction from the design.
- [ ] 2.3 Prove `off` adds no instruction and `suggest` does not call Jev before an ordinary tool invocation.
- [ ] 2.4 Test that repeated context transforms do not duplicate the instruction.
- [ ] 2.5 Document that the setting guides model selection and is not hidden background execution.

## 3. Close the provider boundary

- [ ] 3.1 Make `TYPESAFE_API_KEY` the only public credential source and fail clearly when it is absent.
- [ ] 3.2 Remove the public endpoint override and keep transport injection internal to tests.
- [ ] 3.3 Expand sensitive-file exclusions and add outbound content rejection/redaction before every provider request.
- [ ] 3.4 Sanitize provider errors so response bodies, headers, queries, excerpts, and credentials cannot reach output or logs.
- [ ] 3.5 Add tests with dummy credentials and hostile provider responses; assert the credential and source marker are absent from logs, errors, snapshots, and tool output.

## 4. Make installation one-shot

- [ ] 4.1 Add `scripts/setup-opencode.mjs` and `npm run setup:opencode` with project and global scopes.
- [ ] 4.2 Preserve JSON/JSONC configuration and existing plugins, write atomically, pin the plugin target, and make reruns a no-op.
- [ ] 4.3 Check prerequisites and credential presence without reading or printing the value.
- [ ] 4.4 Verify the installed plugin ID and print an exact removal command.
- [ ] 4.5 Add concise human instructions and a root `AGENTS.md` one-shot instruction.

## 5. Add release verification

- [ ] 5.1 Add `verify:release` for typecheck, tests, build, package allowlist validation, and an OpenCode 2 load/tool-call smoke test.
- [ ] 5.2 Scan the current tree, Git history, and packed artifact for credential patterns.
- [ ] 5.3 Reject source maps containing absolute local paths or embedded source content.
- [ ] 5.4 Add CI for a clean clone and the supported runtime matrix.
- [ ] 5.5 Add `CHANGELOG.md`, `SECURITY.md`, data disclosure, benchmark limitation, troubleshooting, and uninstall instructions.

## 6. Review, release, and install

- [ ] 6.1 Give the completed release candidate and this plan to Code Review Partner.
- [ ] 6.2 Fix every accepted release-blocking finding and obtain a final review with no unresolved blockers.
- [ ] 6.3 Confirm the worktree is clean and the packed artifact matches the reviewed commit.
- [ ] 6.4 Tag `v0.1.0` and publish through protected GitHub Actions with npm trusted publishing and provenance. If npm authentication is unavailable, publish the GitHub tag and use that exact tag; do not claim npm publication.
- [ ] 6.5 Install the exact reviewed release on the user's machine without storing or printing `TYPESAFE_API_KEY`.
- [ ] 6.6 Verify `opencode plugin list`, plugin ID `fast-context`, version, default auto-invocation guidance, and one real tool call against a non-sensitive repository.
- [ ] 6.7 Report commit, review result, release URL, install target, smoke result, and any remaining experimental limitations.

