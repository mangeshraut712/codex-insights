# Codex Insights

Private, trust-aware reports from local Codex sessions. Invoke `$insights` after installing this plugin.

This is a community plugin. It follows the official Codex plugin ingestion contract (`plugin.json` interface, skill `agents/openai.yaml`, and `validate_plugin.py`). It is not published by OpenAI and is not on the Codex official directory tab until OpenAI lists it.

## Install

```bash
codex plugin marketplace add mangeshraut712/codex-insights
codex plugin add codex-insights@codex-insights
```

Start a new Codex thread and type `$insights`. With no extra wording it builds a **local-only** report (zero model calls).

## Capabilities

- **Interactive**: choose local-only, estimate, or a confirmed model-assisted report
- **Read**: local Codex session metadata and transcript excerpts on this machine

The plugin does not write repository files from report recommendations.

## Privacy

Local-only is the default. Estimate does not send session text to a model. Model-assisted mode sends redacted excerpts only after you confirm. Policy: [privacy policy](https://github.com/mangeshraut712/codex-insights/blob/main/docs/privacy-policy.md). Terms: [terms](https://github.com/mangeshraut712/codex-insights/blob/main/docs/terms.md).
