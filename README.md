# codex-session-insights

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen.svg)](https://nodejs.org)

Generate a report from your local Codex sessions.

Use `$insights` in Codex, or run the CLI. `--local-only` is the private default: deterministic metrics and **zero model calls**. Pass `--yes` only when you want model-assisted narratives.

![codex-session-insights screenshot](https://raw.githubusercontent.com/cosformula/codex-session-insights/main/assets/screenshot-1.png)

## Install `$insights`

```bash
codex plugin marketplace add mangeshraut712/codex-insights
codex plugin add codex-insights@codex-insights
```

Start a new Codex thread and type `$insights`.

Or install the CLI and the skill together:

```bash
curl -fsSL https://raw.githubusercontent.com/mangeshraut712/codex-insights/HEAD/scripts/install.sh | bash
```

CLI only:

```bash
npx github:mangeshraut712/codex-insights --local-only
```

More options, including uninstall: [docs/install.md](docs/install.md).

## Quick Start

After install, the usual commands are:

```bash
codex-session-insights --local-only      # private, zero model calls
codex-session-insights --estimate-only   # token range, no generation
codex-session-insights --yes             # model-assisted after you confirm
```

`npx github:mangeshraut712/codex-insights` is the same CLI without a global install. When this package is published to npm:

```bash
npx codex-session-insights --local-only
```

The interactive flow is:

1. Read your local Codex thread index
2. Estimate likely analysis token usage (skipped with `--local-only`)
3. Confirm the plan in an interactive terminal (skipped with `--yes` or `--local-only`)
4. Write `report.html` and `report.json`
5. Try to open the HTML report in your browser

## What You Get

By default the tool writes:

- `~/.codex/usage-data/report.html`
- `~/.codex/usage-data/report.json`

The HTML report includes these sections:

- `Trust & Coverage`
- `At a Glance`
- `What You Work On`
- `How You Use Codex`
- `Impressive Things You Did`
- `Where Things Go Wrong`
- `Features to Try`
- `On the Horizon`
- `One More Thing`

## Typical Usage

Default run:

```bash
npx codex-session-insights
```

Lite local run for prompt and layout testing:

```bash
npx codex-session-insights --preset lite
```

Estimate first, then decide:

```bash
npx codex-session-insights --days 7 --limit 20 --facet-limit 8 --estimate-only
```

Use a custom output directory:

```bash
npx codex-session-insights --out-dir ./insights-output
```

Emit JSON to stdout instead of a terminal summary:

```bash
npx codex-session-insights --stdout-json
```

Include archived threads:

```bash
npx codex-session-insights --include-archived
```

Include sub-agent threads as well as main threads:

```bash
npx codex-session-insights --include-subagents
```

Choose a data source explicitly:

```bash
npx codex-session-insights --data-source app-server
npx codex-session-insights --data-source legacy
```

`auto` is the default: it tries app-server first and records a warning if it falls back to the legacy reader. Use `--app-server-timeout 30000` to change the per-request timeout.

Choose the report language explicitly:

```bash
npx codex-session-insights --lang zh-CN
npx codex-session-insights --lang en
```

Use the OpenAI API instead of your local Codex CLI login:

```bash
npx codex-session-insights --provider openai --api-key $OPENAI_API_KEY
```

## Codex Plugin

`$insights` is the bundled skill. After install, start a **new** thread so Codex can discover it.

- **Default:** local-only report (private, zero model calls)
- **Estimate:** planned model calls and token range, no generation
- **Model-assisted:** estimate first, then generate after confirmation

The skill does not share reports or apply recommendations unless you ask separately.

## Defaults

Current default analysis plan:

- `days`: `30`
- `limit`: `200`
- `facet-limit`: `50`
- `provider`: `codex-cli`
- `facet-model`: `gpt-5.4-mini`
- `fast-section-model`: `gpt-5.4-mini`
- `insight-model`: `gpt-5.4`
- `facet-effort`: `low`
- `fast-section-effort`: `low`
- `insight-effort`: `high`

Important behavior defaults:

- `data-source=auto` uses the documented, read-only app-server adapter before legacy fallback
- `--preset lite` maps to `days=7`, `limit=20`, `facet-limit=8`, `preview=10`
- `limit` means the target number of substantive threads to include in the report, not just the first 50 indexed threads
- `facet-limit` means the max number of uncached per-thread facet analyses to run in a single report
- Report language follows a best-effort system locale check
- Main-thread analysis is the default; sub-agent threads are excluded unless you pass `--include-subagents`
- The CLI shows an estimate before running in interactive terminals
- The CLI tries to open the generated HTML report in your browser after generation
- `--local-only` skips all model cost estimation and generation and labels its findings deterministic

## What It Reads

- Codex app-server `thread/list` and `thread/read` in the default `auto` mode
- `~/.codex/state_*.sqlite` and rollout JSONL only when legacy mode is selected or app-server fallback is required

Collection is read-only. The CLI does not start turns or change session state.

## Requirements

- Node.js `>=18.17.0`
- `sqlite3` on `PATH` only for legacy mode
- Codex CLI installed if you use the default `codex-cli` provider

Supported platform status:

- macOS: expected to work
- Linux: expected to work if `sqlite3` and `codex` are installed
- Windows: not yet verified

## Privacy

The tool reads local Codex data from your machine.

- With `--local-only`, session-derived text stays within the local collector and report renderer; no model is called
- With `provider=codex-cli`, analysis is performed through your local Codex CLI session
- With `provider=openai`, prompts are sent through the OpenAI Responses API
- Recognized credentials and home paths are redacted before caches, model prompts, JSON, and HTML, but pattern-based redaction cannot guarantee removal of every sensitive fact
- Generated reports may still contain project names, thread titles, summaries, and other local development context

Review `report.html` and `report.json` before sharing them.

See [Privacy and trust](docs/privacy-and-trust.md) for coverage semantics, redaction limits, and deletion commands. See [App-server compatibility](docs/app-server-compatibility.md) for fallback behavior.

## Limitations

- Rollout event schemas may drift across Codex versions
- App-server response schemas may drift across Codex versions; explicit app-server mode surfaces protocol failures
- Token estimates are conservative, not billing-accurate
- Model-assisted narratives are interpretations; deterministic reports can also be incomplete when collection coverage is incomplete
- The tool is designed around Codex local storage layout and is not a generic agent log analyzer
- Windows support is not yet verified

## Advanced Overrides

If you want to override the default model split manually:

```bash
npx codex-session-insights \
  --facet-model gpt-5.4-mini \
  --fast-section-model gpt-5.4-mini \
  --insight-model gpt-5.4 \
  --facet-effort low \
  --fast-section-effort low \
  --insight-effort high
```

To suppress browser opening:

```bash
npx codex-session-insights --no-open
```

To force browser opening:

```bash
npx codex-session-insights --open
```

## For Contributors

Useful local commands:

```bash
npm install
npm test
npm run check
npm run report:lite
npm run generate:test-report
```

`npm run report:lite` runs a smaller local analysis preset for testing prompt and layout changes without paying the full 200/50 default cost.
`npm run generate:test-report` writes a deterministic sample report page to `test-artifacts/sample-report/`.

Docs index: [docs/README.md](docs/README.md). Analyzer changes follow [the analyzer contribution contract](docs/contributing-analyzers.md). Release verification is in [the release checklist](docs/release-checklist.md). The proposed native command is an unaccepted [upstream RFC](docs/upstream-rfc.md).
