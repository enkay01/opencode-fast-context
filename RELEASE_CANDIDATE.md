# V1 release candidate

- Branch: `work/retrieval-hill-climb`
- Verified code commit: `17159ff`
- Version: `0.1.0`
- Supported runtime: OpenCode 2 (`>=2.2.0 <3`), tested with 2.2.5; Node 22.18+
- Packed artifact: `opencode-fast-context-0.1.0.tgz`, 29 files, SHA-256 `d4d47e9da18c8cfa7e28e3f5382d2a3ec906bde5ecd8f0336a160c4ff2201a51`
- Status: **release candidate, fixes applied; awaiting re-review. Not tagged, published, or installed.**

## Review fixes from `c15a652`

| Prior finding | Fix | Reproduction test |
| --- | --- | --- |
| 1. Credential-like source reached tool content/metadata; fallback evidence unredacted | `src/engine/search.ts` applies `sanitizeForProvider` to final evidence, rejecting private-key blocks and returning redacted excerpts for both ranked and fallback results. Formatted content and metadata derive from that evidence. | `test/provider-boundary.test.ts`: “final tool content and metadata redact credential-like evidence” and “fallback evidence also redacts credential-like content” assert the `ghp_…` marker is absent from `JSON.stringify(result)` and `formatForModel(result)`. |
| 2. Hostile `x-request-id` entered errors | `src/providers/systemone.ts` accepts only `^[A-Za-z0-9-]{1,64}$`; anything else is omitted. | `test/redact.test.ts`: hostile header with `ghp_…` yields exactly `HTTP 401`; a safe `req-test-123` is retained. |
| 3. Setup searched text and could false-succeed | `scripts/setup-opencode.mjs` parses JSONC (comments, trailing commas), inspects actual `plugins` entries, rewrites only that array, re-parses the written file, asserts the entry exists (or is gone), then verifies plugin identity. | `test/setup.test.ts`: comments and unrelated `"fast-context"` values do not count as an entry; idempotent rerun; removal; project and global scopes. |
| 4. No real OpenCode 2 runtime load; no protected publish workflow | `scripts/smoke-runtime.mjs` starts OpenCode 2.2.5 with a temporary HOME and local plugin path, loads `dist/index.js`, and makes no provider call. `.github/workflows/publish.yml` publishes only on a published release, under protected environment `npm-publish`, with `id-token: write`, tag/version equality check, and `npm publish --provenance --access public`. | `npm run verify:release` runs the runtime smoke; publish workflow is committed but has not executed. |
| 5. Secret-scan exceptions skipped whole lines; absolute-path check was macOS-only | Exceptions now remove only exact dummy values before matching, and the synthetic key block is removed only when it contains the known dummy body. Absolute-path detection covers `/Users/`, `/home/`, `/root/`, `/private/tmp/`, `/var/folders/`, Windows drive paths, and UNC prefixes. | `scripts/verify-release.mjs`; a second real credential on a line containing a dummy would still match. |
| 6. Missing credential labelled `local ranking` | `src/tool.ts` prints `provider: not configured` for provider `none` with `fallback_required`; the footer no longer claims local results. | `test/provider-boundary.test.ts`: “a missing credential is not described as local ranking”. |

## Verification

`npm run verify:release` passed on `17159ff` from a clean tree:

- typecheck
- 59 tests
- build
- mocked OpenCode 2 API registration and tool call
- real OpenCode 2.2.5 runtime load of `dist/index.js` (temporary HOME, invalid model, no provider call)
- package allowlist
- no source, test, benchmark, or source-map files
- tarball, tracked-tree, and Git-history secret scans
- no cross-platform absolute local paths in packed files
- clean working tree

CI `.github/workflows/verify.yml` runs the same command on Node 22, 24, and 26 with OpenCode installed. Its result for this branch is reported in the channel; if the run is unavailable, the local verification is the evidence.

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
| Reviewed release | This document; protected `publish.yml`; independent re-review still required |
| Docs and disclosure | `README.md`; `SECURITY.md`; `CHANGELOG.md`; `AGENTS.md`; benchmark limitation preserved |

## Outstanding gates

1. Code Review Partner re-review of `17159ff` against the six findings and this handoff.
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
