# OpenCode Fast Context

Experimental code retrieval for [OpenCode 2](https://opencode.ai). It finds the files and line ranges that answer a repository question with bounded local search, ranks candidates with Jev, and returns compact citations.

**V1 is an experimental release.** It is faster than stock agentic search in our development measurements, but quality parity is not established. Keep ordinary search available and evaluate it on your own repository. See [BENCHMARK.md](BENCHMARK.md).

## What it does

A model calls:

```json
{ "query": "Where is the retry backoff computed?", "maxFiles": 5 }
```

The plugin:

1. tokenizes the question, stems code terms, expands common synonyms, and groups concepts;
2. searches locally with ripgrep, weighting rare terms and down-weighting docs, translations, and tests;
3. keeps one to three promising ranges per file;
4. sends up to 24 candidate snippets to Jev for relevance scoring, one question per file;
5. re-reads selected evidence, validates line ranges and digests, and returns `path:line` citations.

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

- `complete`: verified citations with short excerpts;
- `no_match`: no candidate passed the relevance threshold;
- `fallback_required`: Jev is unavailable or misconfigured; continue with ordinary search.

Intermediate grep output and provider exchanges stay out of the conversation.

## Remove

```bash
npm run setup:opencode -- --remove --scope global
```

Use `--scope project` if it was installed locally. Restart OpenCode after changing configuration.

## Troubleshooting

- **Tool missing**: confirm OpenCode 2, run `opencode plugin list`, and restart after setup.
- **`TYPESAFE_API_KEY is not set`**: export the key in the environment that launches OpenCode. Do not add it to configuration.
- **Frequent `fallback_required`**: check provider status and the configured model. Ordinary search is unaffected.
- **`no_match` on a real question**: the candidate pool did not contain a passing match. Try more specific identifiers.
- **No guidance added**: check that `autoInvoke` is not `"off"` and that your OpenCode version supports session context hooks.

## Benchmark

Development measurements on a small corpus showed about 89% lower median latency than stock OpenCode with DeepSeek on six tuning tasks, and 73% lower on four fresh validation tasks. On those validation tasks, recall@5 was 0.50 against 1.00 for stock search. The difference is development evidence with one run per task, not a quality-parity claim. Method, limitations, and raw figures are in [BENCHMARK.md](BENCHMARK.md).

## Development

```bash
npm test                  # unit and integration tests
npm run test:corpus       # pinned corpus check (requires bench/repos)
npm run typecheck
npm run verify:release    # typecheck, tests, build, API smoke, package and secret checks
npm run build
```

Release verification does not publish, tag, or install anything. The benchmark requires local pinned checkouts; see [BENCHMARK.md](BENCHMARK.md).

## License

MIT. See [LICENSE](LICENSE).
