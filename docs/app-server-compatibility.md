# Codex app-server compatibility

The default `--data-source auto` mode first uses the documented Codex app-server JSONL protocol. `$insights` keeps that default unless you ask to fail closed (`app-server`) or to force the legacy reader.

The adapter initializes a read-only stdio connection and calls only read-only history methods: `thread/list`, `thread/read`, `thread/turns/list` and `thread/items/list`. It does not start turns, mutate threads, edit repositories, or change Codex configuration.

If app-server startup or protocol handling fails in `auto` mode, the CLI uses the legacy SQLite and rollout reader and adds the reason to Trust & Coverage. An explicit `--data-source app-server` run fails instead of hiding incompatibility. `--data-source legacy` skips app-server startup.

The adapter spawns `codex app-server` (or `$CODEX_BIN` / `--codex-bin`) with a PATH that includes Homebrew and `~/.local/bin`. That matches Codex Desktop on macOS, where `PATH` often omits those directories even though `codex` is installed.

```bash
codex-session-insights --local-only --data-source auto
codex-session-insights --local-only --data-source app-server
codex-session-insights --local-only --data-source legacy
```

Each app-server request has a 10-second default timeout. Override it for unusually slow local environments:

```bash
codex-session-insights --app-server-timeout 30000
```

## Compatibility expectations

The adapter depends on Codex app-server's `initialize`, thread metadata, and paginated turn/item response shapes. Unknown item kinds are counted as tools when possible but do not become invented transcript text. Read failures are isolated per thread unless they indicate a protocol-level incompatibility.

The legacy reader requires a `state_*.sqlite` index, rollout JSONL files, and `sqlite3` on `PATH`. It exists for older Codex installations and explicit troubleshooting; those storage layouts are internal and may drift.

## Diagnosing a fallback

Run with `--data-source app-server` to surface the original error, increase `--app-server-timeout` only when the server is healthy but slow, and verify that the configured `--codex-bin` or `$CODEX_BIN` supports `app-server`. On macOS, confirm `codex` exists at `/opt/homebrew/bin/codex` or `/usr/local/bin/codex` if a GUI-spawned run falls back to legacy. Do not remove a fallback warning from a shared report: it is part of the report's provenance.

## Verified behavior on 14 November 2026

Modern paginated histories use metadata reads followed by all turn pages and per-turn item pages. Legacy threads retain full-history reads. Responses remain bounded to 8 MiB individually, including incomplete lines; coalesced valid responses do not share one allowance. Malformed entries and repeated history cursors fail explicitly. New turns after enumeration are collected on a later run.

A strict local-only run on the maintainer's accessible main-thread inventory discovered four threads, analyzed three substantive sessions and excluded one short session, with no failed reads or fallback. This is a dated observation, not a universal coverage guarantee. This server omitted some locally stored delegated threads from listing even though individual reads worked. The report can only account for the inventory returned by the source. No model-quality or complete cross-version guarantee is claimed.
