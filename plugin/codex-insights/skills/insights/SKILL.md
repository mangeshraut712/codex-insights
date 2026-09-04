---
name: insights
description: Generate a privacy-aware report from local Codex sessions. Use when the user asks for $insights, a session report, usage insights, or offline/private analysis of Codex history.
metadata:
  short-description: Private reports from local Codex sessions
---

# Codex Insights

Run the bundled wrapper at `<plugin-root>/scripts/run-insights.mjs`. The plugin root is the directory that contains `.codex-plugin/` and `scripts/`. Do not copy session data into the conversation.

## Choose a route

If the user does not name a mode, use **local-only** (private, zero model calls).

| User intent | Command |
| --- | --- |
| Unspecified, private, offline, deterministic, no-model | `node <plugin-root>/scripts/run-insights.mjs --local-only --no-open` |
| Cost, tokens, or scope | `node <plugin-root>/scripts/run-insights.mjs --estimate-only --no-open` |
| Model-assisted / narrative / interpreted | Estimate first. Show the estimate and wait for confirmation. Then `node <plugin-root>/scripts/run-insights.mjs --yes --no-open` |

Honor user-supplied scope, output, language, data-source, archive, and subagent flags. Keep `--data-source auto` unless they ask to fail closed on app-server incompatibility (`--data-source app-server`) or to force the legacy reader.

Read `references/report-modes.md` only when choosing flags or explaining Trust & Coverage.

## After a report

- Give the HTML and JSON paths and invite the user to open the HTML file.
- Summarize Trust & Coverage (source, analyzed vs discovered, warnings, analysis mode, redactions).
- Label deterministic findings vs model interpretations.
- Do not paste transcript-derived report contents unless the user asks.
- Do not share, upload, publish, or send a report without explicit authorization.
- Do not edit source files, `AGENTS.md`, configuration, or external systems from report recommendations unless the user separately asks.
