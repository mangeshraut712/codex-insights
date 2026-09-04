# Privacy policy

This policy covers the Codex Insights plugin (`$insights`) and the `codex-session-insights` CLI published at [github.com/mangeshraut712/codex-insights](https://github.com/mangeshraut712/codex-insights).

## What the plugin reads

On the machine where you run Codex or the CLI, the plugin reads local Codex session metadata and transcript excerpts. It does not fetch sessions from other devices or from Codex cloud history.

## What leaves the machine

- **Local-only** (the `$insights` default): zero model calls. Session text stays on the machine except for the report files you choose to open or copy.
- **Estimate**: reads the local population and prints a token range. It does not send session text to a model.
- **Model-assisted**: after you confirm an estimate, redacted excerpts may be sent to the provider you selected (`codex-cli` or the OpenAI Responses API). Those tokens count against that account.

The plugin does not upload reports to a marketplace, telemetry service, or third-party host by itself.

## Redaction

Recognized secrets and the selected home-directory prefix are replaced before cache writes, model prompts, JSON, and HTML. Pattern-based redaction is not a guarantee. Review `report.html` and `report.json` before sharing them.

## Storage

Latest reports default to `~/.codex/usage-data/`. Timestamped copies older than 30 days are deleted at startup and when a new report is written. A seen-session journal lives in that directory so later runs can reuse prior analyses.

To delete generated artifacts:

```bash
rm -rf ~/.codex/usage-data ~/.codex-insights-cache
```

That does not delete Codex’s own session history.

## Contact

Open an issue on the repository if you have a privacy question. Operational detail: [Privacy and trust](privacy-and-trust.md).
