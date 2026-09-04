# Report modes

Inspired by Claude Code `/insights` (how you work, local sessions on this machine). Codex has no native `/insights`. Unspecified `$insights` is **local-only**, which is stricter than Claude’s model-assisted default.

## Default

If the user does not choose a mode, run **local-only**. It is the private, offline default for `$insights`.

A run reads sessions on this machine only, targets up to **200 unseen** substantive sessions (`--limit`), reuses unchanged sessions from `{out-dir}/seen-sessions.json`, and skips very short ones. When sessions are left out, Trust & Coverage and the HTML header use `analyzed sessions (discovered total)`, for example `200 sessions (412 total)`. `--days 0` includes every local session in the index. `--reanalyze` ignores the journal.

## Estimate

`--estimate-only` reads and normalizes the selected session population, calculates the planned model calls and token range, and exits before generation. It does not invoke a model. This is a scope preview for a model-assisted run, not a `/usage`-style billing screen.

## Local-only

`--local-only` performs zero model estimation and generation calls. It renders deterministic counts and conservative findings, including explicit limits on what those counts establish. Use it for unspecified, offline, or private requests.

## Model-assisted

Model-assisted mode extracts sampled facets and generates narrative sections (closer to Claude’s `/insights`). Run `--estimate-only` first and obtain confirmation before generation. Redaction happens before model prompts, but the report can still contain sensitive ordinary prose. Tokens for this path use the selected provider (`codex-cli` or `openai`) and count against that account.

## Data sources

- `auto`: app-server first; visible legacy fallback warning.
- `app-server`: documented read-only `thread/list` and `thread/read`; protocol failure stops the run.
- `legacy`: local SQLite and rollout reader; requires `sqlite3`.

The default population excludes delegated sources. Add `--include-subagents` only when the user explicitly asks to include them.

## Output

Latest files: `~/.codex/usage-data/report.html` and `report.json` (Claude analogue: `~/.claude/usage-data/report.html`). Each successful write also stores timestamped copies in the same directory. Copies older than 30 days are deleted at startup and when a new report is written. The seen-session journal (`seen-sessions.json` plus `session-summaries/`) lives in the same directory so later runs can reuse prior analyses.

## Trust & Coverage

Always inspect and report the data source, discovered, eligible, analyzed, reused, unseen, unseen-over-cap, excluded-short, excluded-source, failed-to-read, sampled, fallback warnings, analysis mode, and redaction count. Do not present incomplete coverage as a complete history.
