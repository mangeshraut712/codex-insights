# Privacy and trust

Codex Session Insights reads session metadata and transcript excerpts on the machine where the CLI or `$insights` runs. It does not upload reports by itself. The selected analysis mode determines whether session-derived text is passed to a model.

This matches Claude Code `/insights` on locality (this machine only, not other devices) and diverges on spend: `$insights` defaults to `--local-only` unless you ask for an estimate or a model-assisted report. See [Claude Code `/insights` mapping](claude-insights.md).

## Analysis modes

`--local-only` makes zero model calls. It computes counts, distributions, failure signals, and conservative text from local data, then writes the normal HTML and JSON reports. It does not infer satisfaction, goal completion, code quality, or root causes.

Model-assisted mode sends redacted, sampled session context through either the authenticated Codex CLI or the OpenAI Responses API. Its narratives are interpretations, not measured facts. Review the Trust & Coverage section and underlying metrics before acting on a recommendation.

Use an estimate without analysis:

```bash
codex-session-insights --estimate-only
```

Use deterministic local analysis:

```bash
codex-session-insights --local-only --no-open
```

## Redaction boundary

Before cache writes, model prompts, JSON, or HTML, the tool replaces recognized API keys, GitHub-style tokens, bearer credentials, password assignments, private-key blocks, and the selected home-directory prefix. Reports include the number of collection-time replacements.

Pattern-based redaction is defense in depth, not a guarantee. It cannot recognize every proprietary token format or sensitive fact expressed in ordinary prose. Inspect both generated files before sharing them. Avoid supplying secrets through titles or prompts in the first place.

## Coverage

Trust & Coverage records the selected data source, discovered and eligible populations, analyzed count, reused vs unseen sessions, unseen-over-cap leftovers, source and short-thread exclusions, read failures, sampling count, fallback warnings, analysis mode, and redaction count. Missing or excluded sessions can make deterministic metrics and model narratives incomplete. The HTML header uses Claude’s shape when sessions are left out: `analyzed sessions (discovered total)`.

Main interactive sessions are included by default. `--limit` (200) is the max **unseen** substantive sessions a run will newly read; previously analyzed sessions are reused from `{out-dir}/seen-sessions.json`. Very short sessions are skipped and journaled so they are not re-read. Delegated and subagent sources are excluded unless `--include-subagents` is explicit. This prevents delegated work from being attributed to the primary user by default. `--days 0` includes all local sessions; `--reanalyze` ignores the journal.

## Storage and deletion

Reports default to `~/.codex/usage-data/report.html` and `report.json`, plus timestamped copies `report-<stamp>.html` / `report-<stamp>.json` in the same directory. Copies older than **30** days are deleted at startup (Claude Code uses `cleanupPeriodDays`, default 30) and again when a new report is written. The seen-session journal and archived summaries live beside those reports. Facet caches default to `~/.codex-insights-cache`; session-summary caches for the legacy reader are stored beneath the selected cache root. A custom output or cache directory may be selected with `--out-dir` and `--cache-dir`.

Delete generated artifacts when they are no longer needed:

```bash
rm -rf ~/.codex/usage-data ~/.codex-insights-cache
```

If custom paths were used, delete those paths instead. This command does not delete Codex's own session history.
