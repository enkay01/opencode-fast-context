# Proposal

## Why

The climb3 plus Jev candidate is implemented on the hill-climb branch, but the repository is not ready for a public OpenCode 2 release. Package metadata still names the OpenCode 1 SDK, the documented configuration exposes experiments that are outside the V1 product, and installation requires manual editing. The tool also relies on the model choosing it from its description, which gives users no clear control over when it should be preferred.

## What changes

- Ship one experimental OpenCode 2 package with climb3 and Jev as the supported runtime path.
- Add an `autoInvoke` setting that gives the model bounded guidance to use `fast_context_search` before broad repository search.
- Keep auto-invocation transparent: the setting changes model guidance and never sends source to Jev until the model calls the tool.
- Reconcile the package with the OpenCode 2 SDK and remove Clef and ablation stages from the public release surface.
- Add outbound-content filtering, credential-safe error handling, release metadata, and an explicit data-disclosure section.
- Add idempotent human and agent installation paths, release verification, and removal instructions.
- Require an independent code review against this change before tagging, publishing, or installing the release.

## Capabilities

### New capabilities

- `v1-release`: the public package, invocation policy, secret-handling boundary, installation workflow, and release gates for the first Fast Context release.

## Impact

The release changes the default provider from local ranking to Jev, adds a session-context transform when auto-invocation is enabled, narrows public configuration, and adds repository scripts and CI checks. The benchmark and experimental stage controls remain available to development code but are not part of the public plugin options.

