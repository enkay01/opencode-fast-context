# Gemini Decisions TUI recording plan

This plan is for a human-run validation of draft PR #6. Run the key wizard first:

```bash
./scripts/gemini-self-test-wizard.sh
```

The wizard uses a clean PR checkout and saves the Gemini key only through OpenCode's masked credential prompt. It prints a `run-gemini-opencode.sh` launcher in the test directory; use that launcher for every session. It isolates the global OpenCode plugin configuration, avoiding a duplicate `fast-context` server entry while retaining the normal credential store. Do not record the AI Studio key page, the auth prompt, or any key entry. The recording starts in a **new** OpenCode session after authentication. Use only the public test checkout for the free API tier. A Google AI Pro subscription does not set the API project's billing tier.

## Prerequisites

- OpenCode 2, `rg`, Node and npm; a verified clean PR checkout from the wizard.
- `asciinema` for local terminal output capture and `agg` for GIF conversion. Install these separately before the recording run; neither is added to this package.
- GitHub CLI 2.100 or newer, authenticated with permission to comment on the PR. `gh pr comment --attach` uploads the GIF as a GitHub attachment.
- Confirm that `GEMINI_API_KEY` is absent from the OpenCode server environment if testing the stored-key flow. Check presence only; do not print the value.

## Scenarios

Record short, separate takes. Show the OpenCode tool call and its result, then stop. Use the same clean checkout and note its commit SHA for every take.

| Take | TUI action | Observable result | Gate |
| --- | --- | --- | --- |
| 1. Known behavior | Ask OpenCode to use `fast_context_search` to locate the stale Fast Context credential removal function. | Visible tool call, `gemini` provider/model metadata, plausible path/range evidence, and a normal completion or a recorded provider error. | No key or unredacted secret in the frames. |
| 2. Boundaries | Repeat a known query with `maxFiles: 1`, then ask about an unrelated absent behavior. | File cap/truncation and the actual absent-query status are visible. Gemini abstention is **uncalibrated**; do not assert that a low score means `no_match`. | Report the observed status, not a quality claim. |
| 3. Restart and switch | Exit and reopen OpenCode; show `/fast-context auth status`. Use `/fast-context provider` to select Jev, then Gemini in the same TUI. Cancel a Jev key prompt if none is configured. | Gemini choice and stored credential persist across restart; both credential states remain distinct while the active provider changes immediately. | No cross-provider key or silent provider fallback. |
| 4. Failure path | If a real request receives HTTP 400/401/403/429/5xx or times out, capture a separate retry. Do not deliberately expose an invalid key to shell history or create quota load. | Safe `fallback_required` or partial-result behavior, status and retry guidance. | Record the failure in the report denominator; do not discard the take. |

The existing automated tests cover malformed responses, 401/403 cleanup, cancellation, headless fallback, and credential isolation without recording a secret-entry flow. For speed and retrieval quality, use the separate paired benchmark protocol with pinned repositories, randomized repeats, and a fresh holdout; a TUI GIF is demonstration evidence, not a benchmark.

## Capture and review

After auth is complete and OpenCode is closed, set `TEST_LAUNCHER` to the absolute launcher path printed by the wizard:

```bash
CAPTURE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fast-context-tui.XXXXXX")"
TEST_LAUNCHER="/path/printed/by/wizard/run-gemini-opencode.sh"
asciinema rec -c "$TEST_LAUNCHER" "$CAPTURE_DIR/take-01.cast"
asciinema play "$CAPTURE_DIR/take-01.cast"
agg "$CAPTURE_DIR/take-01.cast" "$CAPTURE_DIR/take-01.gif"
```

Do not enable `--capture-input` or `--stdin`. Inspect the cast and GIF frame by frame before upload, including any tool output and terminal scrollback. Reject and delete a take containing a key, confidential code, or an unrelated session. Record the OpenCode version, PR head SHA, provider, question, tool status, elapsed time if displayed, and outcome in a short report. Keep raw casts and reports under the temporary capture directory, outside git.

## Upload and cleanup contract

For each approved GIF, the upload helper should:

1. Require an authenticated `gh` session and an explicit PR number (default `6`). Check the PR's head SHA against the recorded SHA, so a stale take is labelled accurately.
2. Post the report with `gh pr comment 6 --repo enkay01/opencode-fast-context --body-file <report> --attach <gif>#<alt-text>`. Include the scenario table, observed statuses, and limitations. Do not upload the raw cast; it can contain terminal control output and is harder to audit.
3. Fetch the returned comment from GitHub and verify that its body contains the hosted GIF attachment and the expected take label. Open the PR comment to confirm the animation renders.
4. **Only after that verification succeeds**, remove the local `.cast`, `.gif`, and temporary report. If upload or verification fails, preserve the files and print their location for retry. Never delete the test checkout or the OpenCode credential automatically.

The upload helper should reject symlinks, paths outside its temporary capture directory, and files it did not create. It should avoid printing cast contents or credentials, and it should leave a concise PR comment URL as the durable audit trail. Do not put recording files in the repository or commit them.

## Exit criteria

- At least the known-behavior, boundary, and restart/switch takes are reviewed and attached to the draft PR.
- The PR comment states the exact head SHA, machine/CLI versions, selected API tier, pass/fail observations, and unrun cases.
- Local recording artifacts are gone only after the verified PR attachment; the key remains in OpenCode until the user chooses `/fast-context auth revoke`.
