---
name: insights
description: Generate a privacy-aware report from local Codex sessions. Use when the user asks for $insights, a session report, usage insights, or offline/private analysis of Codex history.
metadata:
  short-description: Private reports from local Codex sessions
---

# Codex Insights

Inspired by Claude Code `/insights`: a report on **how you work** on this machine, not a billing statement. Codex has no native `/insights`; this skill is `$insights`. Default is **local-only** (zero model calls). Claude’s `/insights` is model-assisted; we do not copy that default.

Run the bundled wrapper at `<plugin-root>/scripts/run-insights.mjs`. The plugin root is the directory that contains `.codex-plugin/` and `scripts/`. Do not copy session data into the conversation.

## Choose a route

If the user does not name a mode, use **local-only** (private, zero model calls).

| User intent | Command |
| --- | --- |
| Unspecified, private, offline, deterministic, no-model | `node <plugin-root>/scripts/run-insights.mjs --local-only --no-open` |
| Cost, tokens, or scope | `node <plugin-root>/scripts/run-insights.mjs --estimate-only --no-open` |
| Model-assisted / narrative / interpreted | Estimate first. Show the estimate and wait for confirmation. Then `node <plugin-root>/scripts/run-insights.mjs --yes --no-open` |

Honor user-supplied scope, output, language, data-source, archive, and subagent flags. Keep `--data-source auto` unless they ask to fail closed on app-server incompatibility (`--data-source app-server`) or to force the legacy reader.

Defaults that match Claude Code `/insights` population rules: this machine only, `--limit 200` unseen sessions, skip very short sessions, reuse previously analyzed sessions, HTML header `analyzed sessions (discovered total)` when some are left out. `--days 0` includes all local sessions. `--reanalyze` ignores the seen-session journal.

Read `references/report-modes.md` only when choosing flags or explaining Trust & Coverage.

## After a report

- Give the HTML and JSON paths (`~/.codex/usage-data/report.html` and `report.json` unless `--out-dir` was set) and invite the user to open the HTML file. Mention that a timestamped copy is kept next to the latest files, and copies older than 30 days are removed at startup and when a new report is written.
- Summarize Trust & Coverage (source, analyzed vs discovered, warnings, analysis mode, redactions). Use the `N sessions (M total)` phrasing when discovered exceeds analyzed.
- Label deterministic findings vs model interpretations.
- Do not paste transcript-derived report contents unless the user asks.
- Do not share, upload, publish, or send a report without explicit authorization.
- Do not edit source files, `AGENTS.md`, configuration, or external systems from report recommendations unless the user separately asks.
