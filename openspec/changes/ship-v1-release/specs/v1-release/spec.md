## Purpose

Define the public OpenCode 2 package, invocation policy, provider boundary, installation workflow, and release gates for Fast Context V1.

## ADDED Requirements

### Requirement: OpenCode 2 package

The release SHALL expose one OpenCode 2 plugin with stable ID `fast-context`, tool `fast_context_search`, climb3 retrieval, and Jev ranking. The public package SHALL NOT expose OpenCode 1 entrypoints, Clef configuration, or benchmark stage selection.

#### Scenario: OpenCode loads the package

- WHEN OpenCode 2 loads the published package
- THEN the plugin registers `fast_context_search` through the OpenCode 2 plugin API and reports ID `fast-context`

### Requirement: Bounded auto-invocation guidance

The plugin SHALL accept `autoInvoke` values `suggest` and `off`, default to `suggest`, and use a session-context instruction to guide the model toward `fast_context_search` for broad repository-location questions. The setting SHALL NOT execute retrieval or contact Jev before a visible tool call.

#### Scenario: Suggest mode is enabled

- WHEN a model context is prepared with `autoInvoke: "suggest"`
- THEN the context contains one bounded instruction to use Fast Context before broad iterative search and to fall back on `no_match` or `fallback_required`

#### Scenario: Auto-invocation is disabled

- WHEN a model context is prepared with `autoInvoke: "off"`
- THEN the plugin adds no tool-selection instruction and makes no provider request

### Requirement: Credential isolation

The release SHALL read the Jev credential only from `TYPESAFE_API_KEY`. It SHALL NOT accept the credential through plugin options, command arguments, repository files, or generated configuration, and SHALL NOT write or print its value.

#### Scenario: Credential is missing

- WHEN Jev is configured and `TYPESAFE_API_KEY` is absent
- THEN setup or tool execution returns a configuration failure with safe provisioning guidance and does not run local ranking as if Jev succeeded

### Requirement: Safe provider payload

The release SHALL exclude sensitive filenames, reject or redact credential-like source content, enforce worktree boundaries, and use the fixed HTTPS TypeSafe endpoint before attaching the bearer credential. Provider errors SHALL omit response bodies and request data.

#### Scenario: Candidate contains a credential marker

- WHEN a candidate contains a private-key block or recognized token form
- THEN that content does not appear in the provider request, tool output, logs, or error text

#### Scenario: Provider returns a hostile error body

- WHEN Jev returns an error body containing the dummy credential or submitted source
- THEN the tool reports only safe provider and status metadata

### Requirement: Reproducible installation

The repository SHALL provide documented pinned-package installation and an idempotent one-shot local setup command for agents. Setup SHALL preserve existing configuration, verify prerequisites and plugin identity, and provide an exact removal command.

#### Scenario: Agent repeats setup

- WHEN an agent runs the one-shot setup twice with prerequisites and credential presence satisfied
- THEN the second run makes no configuration change and both runs verify the same plugin target

### Requirement: Reviewed release

The release SHALL be built from a clean commit, pass release verification, receive independent review against this change, and contain no unresolved release-blocking findings before tagging, publishing, or installing on the user's machine.

#### Scenario: Review finds a blocker

- WHEN Code Review Partner reports an unresolved release-blocking finding
- THEN the repository is not tagged, published, or installed until the finding is fixed and re-reviewed

