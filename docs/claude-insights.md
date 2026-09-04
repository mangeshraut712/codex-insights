# Claude Code `/insights` and Codex `$insights`

Official Claude Code documents `/insights` as a report on **how you work**, not how many tokens you used. That command is the inspiration for this community plugin. Codex does **not** ship a native `/insights` command; this repository provides `$insights` and `codex-session-insights` instead.

Source: [Claude Code commands](https://code.claude.com/docs/en/commands) and [Manage costs effectively](https://code.claude.com/docs/en/costs) (“Analyze your usage patterns”).

## What Claude Code does

From the official docs:

- `/insights` writes an HTML report of recent sessions **on this machine**.
- It is not a `/usage` billing screen. `/usage` tracks tokens and plan bars; `/insights` covers projects, how you use the tool, where things go wrong, and features to try.
- It is not available in cloud sessions.
- A single run analyzes up to **200** sessions it has not seen before and skips very short ones.
- When sessions are left out, the header shows the analyzed count with the total in parentheses, for example `200 sessions (412 total)`.
- The latest report is `~/.claude/usage-data/report.html`. Each run also keeps a timestamped copy in that directory. Claude Code deletes reports on the same schedule as other session data: files older than `cleanupPeriodDays` (default **30**).
- You can run it on any plan and provider. Claude’s analysis uses the same provider and account as regular sessions, and those tokens count against the plan. Sessions from other devices and claude.ai are not included.

## What this plugin does

| Claude Code `/insights` | Codex Insights (`$insights` / CLI) |
| --- | --- |
| Built-in slash command | Community skill `$insights` plus `codex-session-insights`. Native `/insights` is an [unaccepted proposal](upstream-rfc.md) |
| How you work, not token billing | Same split: the report is workflow-oriented. `--estimate-only` is the token-scope preview for a **model-assisted** run, not a substitute for Codex billing |
| Local sessions on this machine | Reads this machine only. Other devices are out of scope |
| Not in cloud sessions | Same: no remote Codex cloud history |
| Up to 200 unseen sessions; skip very short | Default `--limit 200`; short threads go to `excludedShort` |
| Header `200 sessions (412 total)` | HTML and terminal use the same shape from Trust & Coverage (`analyzed` vs `discovered`) |
| `~/.claude/usage-data/report.html` plus timestamped copies | `~/.codex/usage-data/report.html` and `report.json`, plus `report-<stamp>.html` / `.json`. Copies older than **30** days are removed when a new report is written |
| Model-assisted by default (tokens count against the plan) | **Local-only by default** for `$insights`: zero model calls. Model-assisted requires an estimate and confirmation (`--yes` on the CLI) |
| Same provider/account as sessions | `provider=codex-cli` uses local Codex; `provider=openai` uses the Responses API |
| Projects, how you use it, friction, features to try | Trust & Coverage, At a Glance, What You Work On, How You Use Codex, Impressive Things You Did, Where Things Go Wrong, Features to Try, On the Horizon, One More Thing |

Privacy-first is the intentional fork from Claude’s default: unspecified `$insights` stays offline. Ask for a model-assisted report when you want Claude-style narrative sections.

## What this plugin does not claim

- Codex has not accepted `/insights`.
- This is not an official OpenAI or Anthropic product.
- Local-only reports do not infer satisfaction, goal completion, or root causes.
- Pattern-based redaction is not a guarantee. Review files before sharing.
