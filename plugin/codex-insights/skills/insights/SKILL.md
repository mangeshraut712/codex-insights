---
name: insights
description: Generate a privacy-aware Codex session report. Use for report estimates, offline or private local-only analysis, and explicitly approved model-assisted analysis.
---

# Codex Insights

Use the bundled `scripts/run-insights.mjs` wrapper. Resolve it from this plugin's root; do not copy session data into the conversation.

Choose exactly one route:

1. **Estimate** — when the user asks about cost or scope, run:
   `node <plugin-root>/scripts/run-insights.mjs --estimate-only --no-open`
2. **Local-only** — when the user asks for private, offline, deterministic, or no-model analysis, run:
   `node <plugin-root>/scripts/run-insights.mjs --local-only --no-open`
3. **Model-assisted** — first run the estimate route. Show the estimate and ask for confirmation before running:
   `node <plugin-root>/scripts/run-insights.mjs --yes --no-open`

Honor user-supplied scope, output, language, data-source, archive, and subagent flags. Use `--data-source app-server` only when the user wants incompatibility to fail visibly; otherwise retain the `auto` default and report any fallback warning.

After a report is written:

- report the HTML and JSON paths;
- summarize Trust & Coverage, including fallback and read-failure warnings;
- distinguish deterministic findings from model interpretations;
- do not paste transcript-derived report contents into chat unless the user asks;
- do not share, upload, publish, or send a report without explicit authorization;
- do not edit source files, `AGENTS.md`, configuration, or external systems based on recommendations without a separate explicit request.

Read `references/report-modes.md` when choosing flags or explaining privacy and coverage.
