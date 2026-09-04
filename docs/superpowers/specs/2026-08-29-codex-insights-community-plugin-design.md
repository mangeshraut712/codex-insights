# Codex Insights Community Plugin Design

> Historical design notes. Current install and usage: [docs/install.md](../install.md) and the [root README](../../README.md). `$insights` defaults to local-only; distribute with `codex plugin marketplace add mangeshraut712/codex-insights`.

## Goal

Turn `codex-session-insights` into a trustworthy, locally installable Codex skill and plugin that analyzes Codex work without misattributing subagents, hiding sampling gaps, leaking common secrets, or requiring model calls for basic metrics.

## Current baseline

- The existing CLI reads `state_*.sqlite` and rollout JSONL files, generates per-thread facets with Codex or the OpenAI API, and renders HTML and JSON.
- Codex CLI 0.141.0 exposes documented app-server methods for `thread/list` and `thread/read`; a live read-only handshake was verified on this machine.
- The repository's baseline `npm test`, `npm run check`, and `npm run generate:test-report` pass.
- A dependency warns on Node 18.14.2 even though the package currently declares Node 18.0.0 compatibility.

## Product behavior

### Data sources

`--data-source auto` is the default. It tries the documented app-server protocol first and falls back to the legacy SQLite/rollout reader with an explicit report warning. `app-server` fails rather than silently falling back; `legacy` preserves the old reader for compatibility.

Main interactive threads are the default. Subagent, review-agent, compacting-agent, and other delegated source kinds remain excluded unless `--include-subagents` is explicit. Archived threads remain opt-in.

### Trust and privacy

- The collector records discovered, eligible, analyzed, excluded-short, excluded-source, failed-to-read, and sampled counts.
- Model facet selection is representative across projects and time buckets instead of simply taking the newest uncached threads.
- Common API keys, bearer tokens, private-key blocks, credential assignments, and home-directory prefixes are redacted before transcript text reaches cache, model prompts, JSON, or HTML.
- Reports distinguish deterministic facts from model-generated interpretations.
- `--local-only` skips all model calls and produces deterministic insights plus the normal HTML/JSON report.

### Reports

Reports include a coverage and trust section with data source, fallback warnings, population counts, facet sample counts, and analysis mode. Generated findings state their basis. The terminal summary includes the same high-level coverage signal.

### Distribution

The repository contains a valid `codex-insights` plugin with an `insights` skill. Public install:

```bash
codex plugin marketplace add mangeshraut712/codex-insights
codex plugin add codex-insights@codex-insights
```

Unspecified `$insights` requests use `--local-only`. Model-assisted runs still estimate first and wait for confirmation. Official plugin/skill validators must pass.

## Architecture

- `lib/app-server-client.js`: bounded JSONL RPC client for read-only app-server requests.
- `lib/app-server-data.js`: maps documented app-server threads and turn items into the existing summary contract.
- `lib/redaction.js`: deterministic secret and path redaction.
- `lib/sampling.js`: representative project/time selection with stable ordering.
- `lib/deterministic-insights.js`: no-model insight sections with explicit deterministic basis.
- `lib/codex-data.js`: legacy adapter and a common collection result containing summaries plus coverage.
- `lib/cli.js`: data-source and local-only orchestration.
- `lib/report.js`: coverage/trust rendering and local-only support.
- `plugin/codex-insights/`: plugin manifest and `insights` skill.

## Non-goals

- Replacing project linters, profilers, test suites, or Codex Security.
- Claiming measured speedups without benchmarks.
- Automatically editing source files or `AGENTS.md`.
- Uploading reports or publishing a package without a separate verified release decision.
- Claiming OpenAI has accepted a native `/insights` command.

## Acceptance checks

1. Unit tests cover RPC framing/timeouts, app-server mapping, source exclusion, secret redaction, representative sampling, local-only behavior, and coverage rendering.
2. Existing tests remain green.
3. `npm run check`, deterministic report generation, local-only analysis of a synthetic Codex home, and live app-server estimate pass.
4. Plugin and skill validators pass.
5. The personal plugin is installed and `codex plugin list` reports it.
6. The branch contains contribution-ready documentation and no raw user transcript fixtures.
