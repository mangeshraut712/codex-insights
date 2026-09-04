# Contributing analyzers

Analyzer changes must preserve the distinction between observed facts and model interpretation. Add deterministic metrics only when they can be reproduced from normalized session summaries. Do not infer satisfaction, completion, intent, or code quality from tool counts.

## Data contract

Both app-server and legacy adapters normalize into the `SessionSummary` contract in `lib/types.d.ts`. New fields must have the same meaning across sources or explicitly report source-specific absence. Update coverage whenever a collector discovers, excludes, samples, fails to read, or analyzes a thread.

Collection must remain read-only. An analyzer must not edit source trees, `AGENTS.md`, Codex configuration, sessions, deployments, or external services. Main sessions remain the default population; delegated sources require explicit opt-in.

## Privacy gates

Apply redaction before writing cache entries, constructing model prompts, or rendering output. Fixtures must be synthetic and use neutral domains, paths, and token-shaped placeholders. Add a regression assertion that seeded secrets are absent from serialized summaries and reports.

Redaction changes should cover both the direct analyzer output and nested values. Document formats that cannot be safely recognized instead of claiming complete secret detection.

## Tests

Use `node:test` and extend the closest existing test where practical. A new analyzer should include:

- a deterministic input/output test;
- empty and incomplete-data behavior;
- source-parity or explicit source-gap behavior;
- a privacy-boundary test when text is retained;
- report rendering for any public metadata.

Run:

```bash
npm test
npm run check
npm run generate:test-report
```

Do not add a performance percentage without a reproducible benchmark and documented baseline. Do not make a model call from `--local-only`; inject or stub model boundaries in orchestration tests so this remains enforceable.
