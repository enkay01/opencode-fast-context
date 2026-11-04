# V1 release candidate

- Branch: `work/retrieval-hill-climb`
- Verified code commit: `0cf8454`
- Version: `0.1.0`
- Supported runtime: OpenCode 2 (`>=2.2.0 <3`), tested with 2.2.5; Node 22.18+
- Packed artifact: `opencode-fast-context-0.1.0.tgz`, 29 files, SHA-256 `d4d47e9da18c8cfa7e28e3f5382d2a3ec906bde5ecd8f0336a160c4ff2201a51`
- Status: **released on GitHub as `v0.1.0`. npm publication is out of scope by request. Installed in the global OpenCode config on 2026-11-04; the Jev key is not present, so the tool returns `fallback_required` until it is set.**

## Third re-review fix

| Prior finding | Fix | Reproduction |
| --- | --- | --- |
| A config holding an old and the current spec kept both entries: the `Already configured; no change` branch fired when *any* entry matched the target, before the exactly-one-entry rule. Two identical target entries had the same defect. | `scripts/setup-opencode.mjs` now computes `owned` first and enters the no-change path only when `owned.length === 1` and that entry is the exact target. Every other owned state falls through to normalization, which keeps one entry rewritten to the target, then verifies both the candidate text and the file after the atomic write. | `test/setup.test.ts`: “setup normalizes duplicate Fast Context entries to one exact target” covers `["…@0.0.9", "…@0.1.0"]` and two identical target entries, asserts a single exact entry survives in each case, and asserts `no change` only for the lone exact entry. The reviewer's predicate check now reports `exact: true`, `owned: 2`, `configured: false`. |

Clean-clone verification was repeated at `0cf8454` in `/tmp/r3review/repo` (directory name `repo`): `npm ci --ignore-scripts && npm run verify:release` passed 68 tests, typecheck, build, both smokes, package and secret checks, and the clean-tree check. `npm pack --json --ignore-scripts` is still 29 files with SHA-256 `d4d47e9d…2201a51`, unchanged because only `scripts/` and `test/` moved.

## Second re-review fixes

| Prior finding | Fix | Reproduction |
| --- | --- | --- |
| Runtime smoke assumed the clone directory was named `opencode-fast-context` | `scripts/smoke-runtime.mjs` parses the logged `entrypoint=file://…` and compares its resolved path with `<clone>/dist/index.js`. | `test/runtime-smoke.test.ts` uses a clone path named `repo` and rejects a different checkout. |
| Setup could edit a nested `plugins` array, or stop at `]` inside a comment | `findPluginsArray` now scans only the top-level property, and the array scan skips comments and strings. The candidate text is parsed and checked before the atomic write. | `test/setup.test.ts`: nested `other.plugins` stays intact; `]` inside a plugins comment is handled. |

Clean-clone verification was repeated in `/tmp/rereview/repo` (directory name `repo`): `npm ci --ignore-scripts && npm run verify:release` passed.

## Review fixes from `c15a652`

| Prior finding | Fix | Reproduction test |
| --- | --- | --- |
| 1. Credential-like source reached tool content/metadata; fallback evidence unredacted | `src/engine/search.ts` applies `sanitizeForProvider` to final evidence, rejecting private-key blocks and returning redacted excerpts for both ranked and fallback results. Formatted content and metadata derive from that evidence. | `test/provider-boundary.test.ts`: “final tool content and metadata redact credential-like evidence” and “fallback evidence also redacts credential-like content” assert the `ghp_…` marker is absent from `JSON.stringify(result)` and `formatForModel(result)`. |
| 2. Hostile `x-request-id` entered errors | `src/providers/systemone.ts` accepts only `^[A-Za-z0-9-]{1,64}$`; anything else is omitted. | `test/redact.test.ts`: hostile header with `ghp_…` yields exactly `HTTP 401`; a safe `req-test-123` is retained. |
| 3. Setup searched text and could false-succeed | `scripts/setup-opencode.mjs` parses JSONC (comments, trailing commas), inspects actual `plugins` entries, rewrites only that array, re-parses the written file, asserts the entry exists (or is gone), then verifies plugin identity. | `test/setup.test.ts`: comments and unrelated `"fast-context"` values do not count as an entry; idempotent rerun; removal; project and global scopes. |
| 4. No real OpenCode 2 runtime load | `scripts/smoke-runtime.mjs` starts OpenCode 2.2.5 with a temporary HOME and local plugin path, loads `dist/index.js`, and makes no provider call. | `npm run verify:release` runs the runtime smoke. |
| 5. Secret-scan exceptions skipped whole lines; absolute-path check was macOS-only | Exceptions now remove only exact dummy values before matching, and the synthetic key block is removed only when it contains the known dummy body. Absolute-path detection covers `/Users/`, `/home/`, `/root/`, `/private/tmp/`, `/var/folders/`, Windows drive paths, and UNC prefixes. | `scripts/verify-release.mjs`; a second real credential on a line containing a dummy would still match. |
| 6. Missing credential labelled `local ranking` | `src/tool.ts` prints `provider: not configured` for provider `none` with `fallback_required`; the footer no longer claims local results. | `test/provider-boundary.test.ts`: “a missing credential is not described as local ranking”. |

## Reproduce each fix

```bash
node --test test/provider-boundary.test.ts   # findings 1, 6
node --test test/redact.test.ts              # finding 2
node --test test/setup.test.ts               # finding 3, nested-array and duplicate-entry regressions
node --test test/runtime-smoke.test.ts       # clone-directory regression
node scripts/smoke-runtime.mjs               # finding 4 (OpenCode 2.2.5)
npm run verify:release                       # finding 5 and full gate
```

## Verification

`npm run verify:release` passed on `0cf8454` from a clean tree:

- typecheck
- 68 tests
- build
- mocked OpenCode 2 API registration and tool call
- real OpenCode 2.2.5 runtime load of `dist/index.js` (isolated HOME/XDG, invalid model, no provider call)
- package allowlist
- no source, test, benchmark, or source-map files
- tarball, tracked-tree, and Git-history secret scans
- no cross-platform absolute local paths in packed files
- clean working tree

CI `.github/workflows/verify.yml` runs the same command on Node 22, 24, and 26 with OpenCode 2.2.5 installed. The run for `8576ce0` passed all three jobs: https://github.com/enkay01/opencode-fast-context/actions/runs/41743044813. Earlier runs failed while the CI installer and XDG isolation were corrected.

## Packed files (29)

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

## Requirement handoff

| Requirement | Evidence |
| --- | --- |
| OpenCode 2 package, stable ID, one tool | `src/index.ts`; `test/release-surface.test.ts`; `test/plugin.test.ts`; runtime smoke |
| Bounded auto-invocation guidance | `src/guidance.ts`; `test/guidance.test.ts`; `test/plugin.test.ts` proves replay idempotence and zero fetches |
| Credential isolation | `src/config.ts`; `test/provider-boundary.test.ts`; setup tests prove the value is never written |
| Safe provider payload | `src/providers/redact.ts`; `src/engine/search.ts`; `src/providers/systemone.ts`; redaction and boundary tests |
| Fixed HTTPS endpoint | `src/config.ts` ignores `TYPESAFE_ENDPOINT`; test asserts the fixed URL |
| Reproducible installation | `scripts/setup-opencode.mjs`; `test/setup.test.ts` (project, global, JSONC comments, idempotence, removal) |
| Reviewed release | CLEAN review at `04e5001`; GitHub tag `v0.1.0`; no npm workflow |
| Docs and disclosure | `README.md`; `SECURITY.md`; `CHANGELOG.md`; `AGENTS.md`; benchmark limitation preserved |

## Outstanding gates

1. Code Review Partner re-review of `0cf8454` against the seven findings and this handoff.
2. Fix accepted findings and re-review.
3. Clean checkout, tag `v0.1.0`, publish via the protected workflow.
4. Install the exact reviewed version without storing or printing `TYPESAFE_API_KEY`.
5. Verify plugin list, ID, version, guidance, and one real tool call.
6. Confirm the first GitHub verification run.

## Experimental limitations

- Quality parity is not established. Fresh validation found 1 of 2 code files with Jev versus 2 of 2 with stock search.
- Guidance cannot guarantee a tool call.
- Content filtering is defence in depth, not proof that arbitrary source contains no secrets.
- Benchmark evidence remains development evidence with one run per task.
