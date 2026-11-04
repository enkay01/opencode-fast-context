# Design

## Context

The selected release candidate is climb3 with Jev and a 24-file provider budget. Development measurements show a material latency reduction against stock OpenCode search, but the current validation evidence does not establish recall parity. V1 therefore remains an explicit experimental tool and leaves ordinary OpenCode search available.

The public package runs inside the OpenCode server process. It reads `TYPESAFE_API_KEY` from that process environment and sends the query plus bounded source excerpts to the TypeSafe System One endpoint when the tool is called.

## Goals

- Make the selected tool easy to install and likely to be used for suitable repository-location questions.
- Keep every provider request visible as an ordinary tool call.
- Keep credentials out of source, configuration, logs, errors, test fixtures, and release archives.
- Publish one OpenCode 2 contract that can be checked from a clean clone.
- Make setup idempotent for a person or an agent working from the repository.

## Non-goals

- Automatically reading prompts and calling Jev in the background.
- Intercepting or replacing built-in grep, glob, read, or search tools.
- Claiming recall parity or making Fast Context mandatory for every code question.
- Shipping Clef, OpenCode 1 compatibility, or benchmark ablation controls as V1 product features.
- Storing or provisioning the TypeSafe credential.

## Decisions

### Auto-invocation is model guidance

Add a public option:

```ts
autoInvoke?: "suggest" | "off"
```

The default is `suggest`. During setup, the plugin registers a replayable OpenCode 2 session-context transform. It adds one short system instruction:

> For repository questions that require locating behavior across unknown files, call `fast_context_search` before broad iterative search. Do not call it when the user supplied the file, for a direct known-file read, or after it has already answered the question. If it returns `no_match` or `fallback_required`, continue with ordinary search.

The transform does not inspect prompts, execute retrieval, or call a provider. `off` registers no instruction. The README calls this “automatic tool selection guidance” and states that the model can still decline a tool call. Deterministic background prefetch is deferred because it would spend provider quota and transmit code without a visible tool call.

### V1 has one provider path

The public default is Jev with model `jev-latest`, climb3 retrieval, 24 scored files, and the existing ten-second deadline. `TYPESAFE_API_KEY` is the only accepted credential source. Missing credentials produce a configuration failure with setup guidance; they do not silently switch to local ranking.

Clef and stage selection are removed from public types, documentation, exports, and package keywords. Development benchmarks may import internal stage controls without exposing them through plugin options.

### Provider traffic has a narrow boundary

Before a candidate reaches `fetch`, the plugin applies filename exclusion and content redaction. Exclusions cover environment files, private keys, package-manager credentials, Git credentials, cloud credentials, service-account files, Terraform variable files, and symlinks outside the worktree. Content filtering rejects private-key blocks and redacts common credential and bearer-token forms. A rejected candidate is recorded only as a count.

Production configuration uses the fixed HTTPS TypeSafe endpoint. Tests inject a transport or endpoint through an internal interface; V1 does not accept a public endpoint override that can redirect the bearer token and source excerpts.

Provider errors expose the provider, HTTP status, and safe request identifier when present. They do not include response bodies, request headers, the credential, query text, or source excerpts.

### The package targets OpenCode 2

Use `@opencode/plugin` and `Plugin.define` for the typed entrypoint. Publish only the compiled entrypoint, declarations, license, README, changelog, security policy, and package metadata. Remove the OpenCode 1 legacy entrypoint from the release package.

The release version is `0.1.0`. It is called V1 as the first product release while the semver version communicates the experimental contract.

### Installation is checked and reversible

Published install:

```bash
opencode plugin add opencode-fast-context@0.1.0
opencode plugin list
```

Repository install:

```bash
npm ci && npm run verify:release && npm run setup:opencode -- --scope project
```

`setup:opencode` never accepts a credential argument. It checks that `TYPESAFE_API_KEY` exists without reading or printing it, preserves existing OpenCode config, writes atomically, pins the local directory, verifies the plugin ID, and prints the removal command. Re-running it is a no-op.

The root `AGENTS.md` tells an assigned agent to run the repository command, stop when the credential is absent, and ask the user to provision it through their secret manager. It forbids putting the credential in chat, config, `.env`, or command arguments.

### Release is gated by independent review

SWE prepares the branch and a release candidate without publishing. Code Review Partner checks the implementation against every requirement and task in this change, including the packed artifact and a clean-clone OpenCode 2 smoke test. SWE fixes accepted findings. Publication and local installation happen only after the reviewer reports no unresolved release-blocking findings.

Tag the exact reviewed commit and publish a GitHub release. npm publication is out of scope for V1 by request; install from the GitHub tag or local checkout, run the smoke check, and report the installed commit and plugin ID.

## Risks

System guidance cannot guarantee a model tool call. The setting improves selection while preserving a visible call and ordinary fallback. Usage telemetry from local testing should determine whether a later deterministic mode is worth its transmission and cost tradeoff.

Content filtering cannot prove that arbitrary source contains no confidential material. The README must state that enabled Jev calls send selected source excerpts to TypeSafe and that users should choose `autoInvoke: "off"` or remove the plugin for repositories that must remain local.

The package manager and runtime can differ across OpenCode releases. Clean-clone CI and a pinned supported OpenCode 2 version establish the release floor; the README records that version.

