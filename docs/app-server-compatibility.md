# Codex app-server compatibility

The default `--data-source auto` mode first uses the documented Codex app-server JSONL protocol. `$insights` keeps that default unless you ask to fail closed (`app-server`) or to force the legacy reader.

The adapter initializes a read-only stdio connection and calls only `thread/list` and `thread/read`. It does not start turns, mutate threads, edit repositories, or change Codex configuration.

If app-server startup or protocol handling fails in `auto` mode, the CLI uses the legacy SQLite and rollout reader and adds the reason to Trust & Coverage. An explicit `--data-source app-server` run fails instead of hiding incompatibility. `--data-source legacy` skips app-server startup.

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

The adapter depends on Codex app-server's `initialize`, `thread/list`, and `thread/read` response shapes. Unknown item kinds are counted as tools when possible but do not become invented transcript text. Read failures are isolated per thread unless they indicate a protocol-level incompatibility.

The legacy reader requires a `state_*.sqlite` index, rollout JSONL files, and `sqlite3` on `PATH`. It exists for older Codex installations and explicit troubleshooting; those storage layouts are internal and may drift.

## Diagnosing a fallback

Run with `--data-source app-server` to surface the original error, increase `--app-server-timeout` only when the server is healthy but slow, and verify that the configured `--codex-bin` supports `app-server`. Do not remove a fallback warning from a shared report: it is part of the report's provenance.
