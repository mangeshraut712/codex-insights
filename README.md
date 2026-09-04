# Codex Session Insights

[![CI](https://github.com/mangeshraut712/codex-insights/actions/workflows/ci.yml/badge.svg)](https://github.com/mangeshraut712/codex-insights/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen.svg)](https://nodejs.org)

Private reports from your local Codex sessions. Use `$insights` in Codex or the `codex-session-insights` CLI.

This is a community continuation of [cosformula/codex-session-insights](https://github.com/cosformula/codex-session-insights). It is inspired by Claude Code [`/insights`](https://code.claude.com/docs/en/costs): a report on **how you work** on this machine, not a token bill. Codex has no native `/insights`. Mapping: [docs/claude-insights.md](docs/claude-insights.md).

`--local-only` is the private default for `$insights`: deterministic metrics and **zero model calls**. Claude’s `/insights` is model-assisted; ask for `--yes` only when you want that kind of narrative.

![codex-session-insights screenshot](https://raw.githubusercontent.com/cosformula/codex-session-insights/main/assets/screenshot-1.png)

## Install `$insights`

```bash
codex plugin marketplace add mangeshraut712/codex-insights
codex plugin add codex-insights@codex-insights
```

Start a **new** Codex thread and type `$insights`.

CLI and skill together:

```bash
curl -fsSL https://raw.githubusercontent.com/mangeshraut712/codex-insights/HEAD/scripts/install.sh | bash
```

CLI only (no global install):

```bash
npx github:mangeshraut712/codex-insights --local-only
```

Update, uninstall, and from-source steps: [docs/install.md](docs/install.md).

## Use

In Codex, `$insights` with no extra wording builds a **local-only** report. Ask for an estimate or a model-assisted report when you want those routes. The skill does not share reports or apply recommendations unless you ask separately.

After the CLI is on `PATH`:

```bash
codex-session-insights --local-only      # private, zero model calls
codex-session-insights --estimate-only   # token range, no generation
codex-session-insights --yes             # model-assisted after you confirm
```

Reports write to `~/.codex/usage-data/` (Claude analogue: `~/.claude/usage-data/`):

- `report.html` / `report.json` — latest run
- `report-<stamp>.html` / `report-<stamp>.json` — timestamped copies; copies older than 30 days are removed on the next write

HTML header coverage matches Claude: `200 sessions (412 total)` when some discovered sessions are left out (short threads, source filters, or the 200-session cap). HTML sections: Trust & Coverage, At a Glance, What You Work On, How You Use Codex, Impressive Things You Did, Where Things Go Wrong, Features to Try, On the Horizon, One More Thing.

The interactive CLI flow is:

1. Read your local Codex thread index on this machine
2. Estimate likely analysis token usage (skipped with `--local-only`)
3. Confirm the plan in a TTY (skipped with `--yes` or `--local-only`)
4. Write HTML and JSON, plus a timestamped copy
5. Try to open the latest HTML report

## Usage

```bash
codex-session-insights --preset lite
codex-session-insights --days 7 --limit 20 --facet-limit 8 --estimate-only
codex-session-insights --out-dir ./insights-output
codex-session-insights --stdout-json
codex-session-insights --include-archived
codex-session-insights --include-subagents
codex-session-insights --data-source app-server
codex-session-insights --data-source legacy
codex-session-insights --lang zh-CN
codex-session-insights --lang en
codex-session-insights --provider openai --api-key "$OPENAI_API_KEY"
codex-session-insights --no-open
codex-session-insights --open
```

`auto` is the default data source: app-server first, with a visible warning if it falls back to the legacy reader. `--app-server-timeout 30000` changes the per-request timeout.

Without a global install, prefix the same flags with `npx github:mangeshraut712/codex-insights`. When the package is published to npm, `npx codex-session-insights` works the same way.

## Defaults

- `days`: `30`
- `limit`: `200` (substantive threads to include, not merely the first indexed rows)
- `facet-limit`: `50` (uncached per-thread facet analyses in one report)
- `provider`: `codex-cli`
- `facet-model` / `fast-section-model`: `gpt-5.4-mini`
- `insight-model`: `gpt-5.4`
- `facet-effort` / `fast-section-effort`: `low`
- `insight-effort`: `high`
- `--preset lite` → `days=7`, `limit=20`, `facet-limit=8`, `preview=10`
- Report language follows a best-effort system locale
- Main threads only; pass `--include-subagents` to include delegated sources
- `$insights` defaults to `--local-only`; the CLI wizard still estimates before a model-assisted run

Override the model split:

```bash
codex-session-insights \
  --facet-model gpt-5.4-mini \
  --fast-section-model gpt-5.4-mini \
  --insight-model gpt-5.4 \
  --facet-effort low \
  --fast-section-effort low \
  --insight-effort high
```

## What it reads

- Codex app-server `thread/list` and `thread/read` in default `auto` mode
- `~/.codex/state_*.sqlite` and rollout JSONL only for `--data-source legacy` or a recorded `auto` fallback

Collection is read-only. The CLI does not start turns or change session state. See [App-server compatibility](docs/app-server-compatibility.md).

## Requirements

- Node.js `>=18.17.0`
- Codex CLI for `$insights` and for the default `codex-cli` provider
- `sqlite3` on `PATH` only for legacy mode

macOS and Linux are expected to work. Windows is not yet verified.

## Privacy

The tool reads local Codex data on your machine.

- `--local-only` (the `$insights` default): no model is called
- `provider=codex-cli`: analysis uses your local Codex CLI session
- `provider=openai`: prompts go to the OpenAI Responses API
- Recognized credentials and home paths are redacted before caches, prompts, JSON, and HTML. Pattern-based redaction cannot guarantee every sensitive fact is removed
- Reports may still contain project names, thread titles, and other local development context

Review `report.html` and `report.json` before sharing. See [Privacy and trust](docs/privacy-and-trust.md).

## Limitations

- Rollout and app-server schemas may drift across Codex versions
- Token estimates are conservative, not billing-accurate
- Model-assisted narratives are interpretations; incomplete collection also limits deterministic reports
- This is not a generic agent-log analyzer
- Windows support is not yet verified

## Docs and contributing

User and contributor guides: [docs/README.md](docs/README.md).

```bash
npm ci
npm run ci
npm run generate:test-report
bash scripts/install.sh
```

Analyzer changes follow [docs/contributing-analyzers.md](docs/contributing-analyzers.md). A native `/insights` command is an unaccepted [proposal](docs/upstream-rfc.md), not a shipped Codex feature. Maintainers are **mangeshraut712** and **Cursor** only; automated GitHub dependency bots are not used.
