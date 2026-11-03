# V1 release candidate

- Branch: `work/retrieval-hill-climb`
- Verified code commit: `9bcdcd6`
- Version: `0.1.0`
- Supported runtime: OpenCode 2 (`>=2.2.0 <3`), tested with 2.2.5; Node 22.18+
- Status: **release candidate, not reviewed, not tagged, not published, not installed**

## Verification

`npm run verify:release` passed on the verified code commit:

- typecheck
- 53 tests
- build
- OpenCode 2 API registration and mocked tool-call smoke test
- package allowlist
- no source, test, benchmark, or source-map files in the package
- tarball secret scan
- no absolute local paths in packed files
- tracked-tree secret scan
- Git history secret scan
- clean working tree

CI workflow `.github/workflows/verify.yml` runs the same command on Node 22, 24, and 26. The first GitHub run has not happened yet.

## Packed files

```
CHANGELOG.md
LICENSE
README.md
SECURITY.md
dist/config.d.ts
dist/config.js
dist/engine/discover.d.ts
dist/engine/discover.js
dist/engine/files.d.ts
dist/engine/files.js
dist/engine/search.d.ts
dist/engine/search.js
dist/engine/tokenize.d.ts
dist/engine/tokenize.js
dist/guidance.d.ts
dist/guidance.js
dist/index.d.ts
dist/index.js
dist/providers/redact.d.ts
dist/providers/redact.js
dist/providers/systemone.d.ts
dist/providers/systemone.js
dist/providers/types.d.ts
dist/providers/types.js
dist/tool.d.ts
dist/tool.js
dist/types.d.ts
dist/types.js
package.json
```

## Requirement-by-requirement handoff

| Requirement | Implementation | Verification to check |
| --- | --- | --- |
| OpenCode 2 package with stable ID and tool | `src/index.ts` uses `Plugin.define`, ID `fast-context`; package exports only `.` and `./package.json`; no legacy or Clef export | `test/release-surface.test.ts`, `test/plugin.test.ts`, `scripts/smoke-opencode.mjs`; inspect `package.json` |
| Bounded auto-invocation guidance | `src/guidance.ts` holds the single instruction; `autoInvoke` defaults to `suggest`; `off` registers no hook; context hook mutates only `system` | `test/guidance.test.ts`, `test/plugin.test.ts` (replay is idempotent; zero fetches during context preparation) |
| Credential isolation | `src/config.ts` reads only `TYPESAFE_API_KEY`; missing key returns `fallback_required` without local ranking; options cannot carry a key | `test/provider-boundary.test.ts`; inspect `resolveProvider` and `runFastContext` |
| Safe provider payload | Expanded exclusions in `src/engine/files.ts`; reject/redact in `src/providers/redact.ts`; applied in `src/engine/search.ts`; errors sanitized in `src/providers/systemone.ts` | `test/redact.test.ts`, `test/provider-boundary.test.ts`; check diagnostics counters and hostile-error assertions |
| Fixed provider endpoint | `src/config.ts` ignores `TYPESAFE_ENDPOINT`; endpoint injection exists only as an internal test seam | `test/provider-boundary.test.ts` asserts `https://api.typesafe.ai/v1/systemone` even with `TYPESAFE_ENDPOINT` set |
| Reproducible installation | `scripts/setup-opencode.mjs` supports project/global scopes, JSON/JSONC preservation, atomic write, no-op rerun, plugin-ID verification, and removal | `test/setup.test.ts`; inspect script; run in a temporary directory |
| Release verification | `scripts/verify-release.mjs`; `npm run verify:release`; CI matrix | Re-run `npm run verify:release` on a clean clone |
| Docs and disclosure | `README.md` install, options, data sent to TypeSafe, removal, troubleshooting; `CHANGELOG.md`; `SECURITY.md`; `AGENTS.md`; benchmark limitation preserved | Read README data-disclosure and benchmark sections |
| Reviewed release gate | Not met yet | Code Review Partner review must report no unresolved blockers before tag/publish/install |

## Outstanding gates

1. Independent review against `openspec/changes/ship-v1-release/`.
2. Fix accepted findings and re-review.
3. Clean checkout, tag `v0.1.0`, publish through protected CI with provenance.
4. Install the exact reviewed version on the user's machine without storing or printing the credential.
5. Verify `opencode plugin list`, plugin ID `fast-context`, version, guidance, and one real tool call.

## Experimental limitations

- Quality parity is not established. Fresh validation found 1 of 2 code files with Jev versus 2 of 2 with stock OpenCode search.
- `autoInvoke: "suggest"` improves selection likelihood; it cannot guarantee a tool call.
- Content filtering reduces but cannot prove absence of confidential material in arbitrary source.
- The benchmark evidence remains development evidence, with one run per task.
