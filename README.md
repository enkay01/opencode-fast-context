# OpenCode Fast Context

Fast Context pulls relevant repository files and excerpts into your OpenCode agent's context. It uses bounded local search, ranks candidates with Jev, and returns paths with line ranges for the caller to read. The tool locates material; it does not answer the question itself.

## What it does

A model calls:

```json
{ "query": "retry backoff attempt jitter", "maxFiles": 5 }
```

The plugin:

1. tokenizes the query, stems code terms, expands common synonyms, and groups concepts;
2. searches locally with ripgrep, weighting rare terms and down-weighting docs, translations, and tests;
3. keeps one to three promising ranges per file;
4. sends up to 24 candidate snippets to Jev for relevance scoring, one question per file;
5. re-reads selected evidence, validates line ranges and digests, and returns `path:line` citations.

The result describes what was searched: candidate windows passed into relevance scoring, distinct files among them, and whether discovery hit its deadline. `complete` means retrieval completed. `no_match` means this search selected no relevant evidence; it is not proof that the project lacks the material. For current status or a missing artifact, the caller should also inspect the relevant directories and version-control state. Encrypted artifact contents need a suitable reader.

It does not build an index, write to the repository, run a background process, or intercept built-in search tools.

## Requirements

- OpenCode 2 (`>=2.2.0 <3`); tested with 2.2.5.
- Node 22.18 or newer for local setup and development.
- `ripgrep` (`rg`) on `PATH`.
- A TypeSafe API key in `TYPESAFE_API_KEY`.

## Install

### From GitHub (recommended)

```bash
opencode plugin add github:enkay01/opencode-fast-context#v0.1.0
opencode plugin list
```

This installs the tagged release. npm publication is intentionally not used for V1.

### From a local checkout

```bash
git clone --branch v0.1.0 https://github.com/enkay01/opencode-fast-context
cd opencode-fast-context
npm ci
npm run verify:release
npm run setup:opencode -- --scope global
```

`setup:opencode` adds the absolute checkout path to the global OpenCode configuration, preserves existing plugins, verifies the plugin ID, and prints the removal command. Re-running it is a no-op. Use `--scope project` for a project-local install. Add `--allow-missing-credential` to install before the API key is provisioned; Fast Context returns `fallback_required` until the key is set.

### One-shot instruction for an agent

The root [AGENTS.md](AGENTS.md) tells an assigned agent to run:

```bash
npm ci && npm run verify:release && npm run setup:opencode -- --scope project
```

The agent must stop if `TYPESAFE_API_KEY` is absent and ask the user to provision it through their secret manager. It must never request the value in chat or write it to a file.

## Credential

Fast Context reads only `TYPESAFE_API_KEY` from the environment of the OpenCode server process. Start OpenCode from a shell or service where your secret manager has exported it:

```bash
# Example only; do not commit this line.
export TYPESAFE_API_KEY="$(your-secret-manager read typesafe)"
opencode
```

Do not put the key in `opencode.json`, `opencode.jsonc`, plugin options, command arguments, or a repository file. The plugin does not accept it through any of those. If the key is missing, the tool returns a configuration failure and ordinary search remains available. It never silently substitutes local ranking.

## Configuration

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-fast-context@0.1.0"]
}
```

To set an option, use the object form:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    { "package": "opencode-fast-context@0.1.0", "options": { "autoInvoke": "off" } }
  ]
}
```

Optional plugin options:

| Option | Values | Default | Meaning |
| --- | --- | --- | --- |
| `autoInvoke` | `"suggest"` or `"off"` | `"suggest"` | Adds one session instruction telling the model when to call `fast_context_search`. |

`suggest` adds this guidance to model context:

> For repository questions that require locating behavior across unknown files, call `fast_context_search` before broad iterative search. Do not call it when the user supplied the file, for a direct known-file read, or after it has already answered the question. If it returns `no_match` or `fallback_required`, continue with ordinary search.

This is **automatic tool selection guidance**, not hidden execution. The plugin does not inspect prompts, run retrieval, or contact Jev until the model makes a visible `fast_context_search` tool call. The model can still decline. Set `"off"` to add no instruction.

## Data sent to TypeSafe

When the tool runs, the query and up to 24 bounded source excerpts are sent over HTTPS to TypeSafe's System One endpoint. Provider credentials and request headers are not included in tool output or errors.

Before sending, the plugin:

- excludes `.env*`, package-manager credentials, Git credentials, cloud configuration, service-account files, Terraform variable files, private keys, and symlinks outside the worktree;
- rejects private-key and certificate blocks;
- redacts common API-key, bearer-token, cloud-key, and JWT patterns.

Redaction is defence in depth, not a guarantee that arbitrary source contains no confidential material. For repositories that must stay local, set `autoInvoke: "off"` and do not call the tool, or remove the plugin.

## Results

The tool returns one of:

- `complete`: retrieval completed with checked citations and short excerpts;
- `no_match`: no relevant evidence was selected in the searched scope;
- `fallback_required`: Jev is unavailable or misconfigured; continue with ordinary search.

Intermediate grep output and provider exchanges stay out of the conversation.

## Remove

```bash
npm run setup:opencode -- --remove --scope global
```

Use `--scope project` if it was installed locally. Restart OpenCode after changing configuration.

## Troubleshooting

- **Tool missing after install**: restart the background service with `opencode service restart`, then start a new session. Existing sessions keep their old tool catalog. `opencode plugin list` does not show local-path plugins; use `opencode api GET /api/plugin` instead.
- **Key works in a terminal but not the app**: the `opencode` shell wrapper only affects processes launched from that shell. The background service and a Dock-launched app do not inherit it. Restart the service from the wrapped shell, or launch OpenCode from that terminal.
- **`TYPESAFE_API_KEY is not set`**: export the key in the environment that launches OpenCode. Do not add it to configuration.
- **Frequent `fallback_required`**: check provider status and the configured model. Ordinary search is unaffected.
- **`no_match` on a real target**: the searched candidate pool did not contain a passing match. Try more specific identifiers or inspect the relevant directories.
- **No guidance added**: check that `autoInvoke` is not `"off"` and that your OpenCode version supports session context hooks.

## Benchmark

Development measurements on a small corpus: median latency was about 89% lower than stock OpenCode with DeepSeek on six tuning tasks (4.8s versus 44.2s), and 73% lower on four validation tasks (5.1s versus 18.6s). Recall@5 on the validation tasks was 0.50 against 1.00 for stock search. Each figure is one run per task on that corpus. Method, sample sizes, and limits are in [BENCHMARK.md](BENCHMARK.md).

## Development

```bash
npm test                  # unit and integration tests
npm run test:corpus       # pinned corpus check (requires bench/repos)
npm run typecheck
npm run verify:release    # typecheck, tests, build, API and runtime contract smoke, package and secret checks
npm run build
```

Release verification does not publish, tag, or install anything. The generated agent contract is in [docs/agent-contract.md](docs/agent-contract.md); `npm run contract:check` detects drift. The benchmark requires local pinned checkouts; see [BENCHMARK.md](BENCHMARK.md).

## License

MIT. See [LICENSE](LICENSE).
