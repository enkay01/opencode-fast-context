# Tasks

## 1. Corpus and baseline

- [ ] 1.1 Add task and run-manifest schemas with pinned repository revisions, hidden reviewed ranges, and split membership; verify malformed revisions and leaked labels are rejected by fixture tests.
- [ ] 1.2 Prepare 24 tasks across pinned OpenCode and ripgrep checkouts, reserve eight held-out tasks, and document source review for every label; verify each range exists at its pinned revision.
- [ ] 1.3 Implement a fresh-session stock OpenCode runner with plugin disabled and explicit DeepSeek model/provider recording; verify one recorded baseline transcript uses normal tools and contains no candidate labels.
- [ ] 1.4 Document reproducible baseline commands and local transcript exclusions; verify a dry run writes a complete manifest without making provider calls.

## 2. Measurement and comparison

- [ ] 2.1 Implement metric calculation and failure accounting; verify hand-scored fixtures for precision, recall, line coverage, no-answer cases, timeout, and unavailable usage.
- [ ] 2.2 Add repeated randomized paired scheduling and startup/cache annotations; verify a deterministic seed reproduces run order and every failed run remains in output.
- [ ] 2.3 Add B1, Jev, and Clef arms using the shared retrieval engine when available; verify manifests hold the main DeepSeek model and task/output budgets constant across comparisons.
- [ ] 2.4 Generate per-task and aggregate reports with variability, fallback totals, and target comparisons; verify a synthetic slower or lower-recall candidate is reported as missing targets.

## 3. Integration evidence

- [ ] 3.1 Run B0 before candidate tuning and preserve reviewed manifests and targets; verify the baseline report identifies exact versions and contains no secrets.
- [ ] 3.2 Run candidate comparisons on frozen held-out tasks and publish reviewed reports; verify every reported figure traces to raw run records and distinguish targets from measured results.
