# Report modes

## Default

If the user does not choose a mode, run **local-only**. It is the private, offline default for `$insights`.

## Estimate

`--estimate-only` reads and normalizes the selected session population, calculates the planned model calls and token range, and exits before generation. It does not invoke a model.

## Local-only

`--local-only` performs zero model estimation and generation calls. It renders deterministic counts and conservative findings, including explicit limits on what those counts establish. Use it for unspecified, offline, or private requests.

## Model-assisted

Model-assisted mode extracts sampled facets and generates narrative sections. Run `--estimate-only` first and obtain confirmation before generation. Redaction happens before model prompts, but the report can still contain sensitive ordinary prose.

## Data sources

- `auto`: app-server first; visible legacy fallback warning.
- `app-server`: documented read-only `thread/list` and `thread/read`; protocol failure stops the run.
- `legacy`: local SQLite and rollout reader; requires `sqlite3`.

The default population excludes delegated sources. Add `--include-subagents` only when the user explicitly asks to include them.

## Trust & Coverage

Always inspect and report the data source, discovered, eligible, analyzed, excluded-short, excluded-source, failed-to-read, sampled, fallback warnings, analysis mode, and redaction count. Do not present incomplete coverage as a complete history.
