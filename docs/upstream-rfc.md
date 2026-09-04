# RFC: reserve `/insights` for session analysis

## Request

Reserve a native `/insights` entry point in Codex for privacy-aware analysis of a user's own session history. Inspiration is Claude Code [`/insights`](https://code.claude.com/docs/en/costs): how you work on this machine, up to 200 sessions, skip short ones, HTML under a local `usage-data` directory. The current community plugin is installed as `$insights`:

```bash
codex plugin marketplace add mangeshraut712/codex-insights
codex plugin add codex-insights@codex-insights
```

Unspecified `$insights` requests default to local-only analysis (stricter than Claude’s model-assisted default). This RFC proposes a product-owned command without claiming acceptance or a delivery commitment.

## User value

Users can already inspect individual sessions, but they cannot easily see population coverage, repeated failure signals, project concentration, or the provenance of generated recommendations. A native entry point could make the analysis boundary predictable and expose trust metadata consistently across CLI and desktop surfaces.

## Proposed behavior

`/insights` should begin with mode and scope selection:

- estimate only, before model-assisted analysis;
- deterministic local-only analysis with zero model calls;
- explicitly confirmed model-assisted interpretation;
- main sessions by default, with delegated sources opt-in;
- app-server collection with visible compatibility fallback.

Every result should expose source, discovered and eligible populations, analyzed and sampled counts, exclusions, read failures, fallback warnings, analysis basis, and redaction totals. Model narratives must be labeled as interpretations.

## Privacy gates

Collection must be read-only. Recognized secrets and home paths must be redacted before caches, prompts, or rendered output. Reports remain local unless the user explicitly shares them. Product UI should make deletion and retention controls visible and must not apply recommendations to repositories or configuration without a separate authorization.

## Stable interchange

The community implementation emits schema version `2` with top-level `analysisMode` and `privacy`, collection coverage in metadata, deterministic or model insight basis, aggregate metrics, and optional thread previews. A native implementation need not preserve the HTML layout, but retaining a versioned JSON export would support debugging and community analyzers.

## Open questions

- Which session fields are stable enough for a supported analytics contract?
- Should desktop and CLI share a local report store?
- Which additional secret detectors can run with low false-positive rates?
- How should users compare reports without retaining transcript excerpts?
- What benchmark is required before presenting workflow-improvement percentages?

The current plugin is an experiment and fallback, not evidence that the command has been accepted upstream.
