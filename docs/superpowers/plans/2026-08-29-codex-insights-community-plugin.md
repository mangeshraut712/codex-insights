# Codex Insights Community Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a tested, locally installed Codex Insights skill/plugin with documented app-server collection, deterministic local-only reports, representative sampling, privacy redaction, and visible coverage.

**Architecture:** Add a documented app-server adapter beside the existing legacy reader, normalize both into the current session-summary contract, and attach coverage metadata to the report. Keep model synthesis optional; deterministic insights and rendering remain usable without a network or model call. Package the CLI workflow as a validated plugin skill after the core behavior is green.

**Tech Stack:** Node.js ESM, built-in `node:test`, Codex app-server JSONL RPC, existing HTML/JSON renderer, Codex skill and plugin manifests.

## Global Constraints

- Default data source is `auto`: app-server first, explicit legacy fallback warning.
- Default analysis excludes all subagent and delegated source kinds.
- No raw personal transcripts or secrets may be added as fixtures.
- Redaction occurs before cache writes, model prompts, JSON, and HTML.
- `--local-only` performs zero model calls and still writes usable HTML and JSON.
- Every report exposes population, exclusion, sampling, fallback, and analysis-mode metadata.
- No performance percentage is reported without benchmark evidence.
- No source, `AGENTS.md`, deployment, release, or external-service mutation occurs during analysis.
- Preserve existing CLI flags and report sections unless this plan explicitly extends them.
- Declare Node.js `>=18.17.0`, matching the installed dependency floor.

---

### Task 1: Documented app-server data adapter

**Files:**
- Create: `lib/app-server-client.js`
- Create: `lib/app-server-data.js`
- Create: `test/app-server-client.test.js`
- Create: `test/app-server-data.test.js`
- Modify: `lib/codex-data.js`
- Modify: `lib/types.d.ts`

**Interfaces:**
- Produces: `createAppServerClient({ codexBin, timeoutMs, spawnImpl })` with `request(method, params)` and `close()`.
- Produces: `collectAppServerThreadSummaries(options)` returning `{ summaries, coverage }`.
- Produces: `collectThreadData(options)` selecting `auto`, `app-server`, or `legacy`.
- Preserves: `collectThreadSummaries(options)` as a summaries-only compatibility wrapper.

- [ ] **Step 1: Write failing RPC and mapping tests**

Add tests that feed fragmented JSONL responses, assert request correlation, assert a timeout rejects, map `userMessage`, `agentMessage`, `commandExecution`, `fileChange`, `mcpToolCall`, `dynamicToolCall`, `collabAgentToolCall`, and `webSearch` items, and verify subagent source kinds are excluded by default.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test test/app-server-client.test.js test/app-server-data.test.js`

Expected: failure because the two modules do not exist.

- [ ] **Step 3: Implement the minimal read-only adapter**

The client sends `initialize`, then `initialized`, and supports bounded `thread/list` and `thread/read` calls. The data adapter paginates active and optional archived threads, requests full turns, maps items into the existing summary fields, and returns coverage counts without mutating any thread.

- [ ] **Step 4: Integrate source selection and compatibility wrapper**

`collectThreadData({ dataSource: 'auto' })` catches app-server availability/protocol errors, records a warning, then invokes the legacy adapter. `dataSource: 'app-server'` surfaces the error. The old export returns only `.summaries`.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test test/app-server-client.test.js test/app-server-data.test.js test/codex-data.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

Run: `git add lib/app-server-client.js lib/app-server-data.js lib/codex-data.js lib/types.d.ts test/app-server-client.test.js test/app-server-data.test.js && git commit -m "feat: read sessions through Codex app server"`

### Task 2: Redaction, representative sampling, and coverage

**Files:**
- Create: `lib/redaction.js`
- Create: `lib/sampling.js`
- Create: `test/redaction.test.js`
- Create: `test/sampling.test.js`
- Modify: `lib/codex-data.js`
- Modify: `lib/llm-insights.js`
- Modify: `test/codex-data.test.js`

**Interfaces:**
- Produces: `redactSensitiveText(value, { homeDir })` returning `{ text, redactions }`.
- Produces: `selectRepresentativeThreads(threads, limit)` with stable project/time stratification.
- Extends: collection coverage with `discovered`, `eligible`, `analyzed`, `excludedShort`, `excludedSource`, `failedToRead`, `sampled`, `dataSource`, and `warnings`.

- [ ] **Step 1: Write failing privacy and sampling tests**

Seed synthetic OpenAI-style keys, GitHub-style tokens, bearer tokens, password assignments, private-key blocks, and a fake home path. Assert none survive. Build a skewed thread set across three projects and three time ranges; assert a small sample represents each group and is stable.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/redaction.test.js test/sampling.test.js`

Expected: module-not-found failures.

- [ ] **Step 3: Implement redaction before persistence**

Apply the redactor to first prompts, user/assistant transcript lines, command failure output, command samples, titles sent to model context, and app-server item text. Store only placeholders such as `[REDACTED_API_KEY]` and a redaction count.

- [ ] **Step 4: Implement representative facet selection**

Replace newest-first uncached facet selection with stable round-robin strata keyed by normalized project plus calendar week. Cached facets may be reused, but the report records how many selected facets were cached and new.

- [ ] **Step 5: Run privacy, sampling, and regression tests**

Run: `node --test test/redaction.test.js test/sampling.test.js test/codex-data.test.js && npm test`

Expected: all tests pass and seeded secrets are absent from serialized summaries.

- [ ] **Step 6: Commit**

Run: `git add lib/redaction.js lib/sampling.js lib/codex-data.js lib/llm-insights.js test/redaction.test.js test/sampling.test.js test/codex-data.test.js && git commit -m "feat: add privacy and representative sampling"`

### Task 3: Deterministic local-only reports and trust metadata

**Files:**
- Create: `lib/deterministic-insights.js`
- Create: `test/deterministic-insights.test.js`
- Modify: `lib/cli.js`
- Modify: `lib/report.js`
- Modify: `lib/types.d.ts`
- Modify: `test/cli.test.js`
- Modify: `test/report.test.js`
- Modify: `test/fixtures/sample-report.js`

**Interfaces:**
- Produces: `buildDeterministicInsights(report)` matching the existing insight-section shape and adding `basis: 'deterministic'`.
- Extends CLI: `--local-only`, `--data-source <auto|app-server|legacy>`, and `--app-server-timeout <ms>`.
- Extends report metadata: `analysisMode`, `coverage`, `privacy`, and `schemaVersion`.

- [ ] **Step 1: Write failing local-only and report tests**

Assert argument parsing, equivalent-command rendering, zero invocation of model functions under `--local-only`, HTML coverage labels, JSON coverage fields, deterministic basis labels, and terminal fallback warnings.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/deterministic-insights.test.js test/cli.test.js test/report.test.js`

Expected: failures for the new flags and missing deterministic insight builder.

- [ ] **Step 3: Implement deterministic insight sections**

Build concise findings from existing metrics: verification/tool failures, capability usage, project concentration, context overlap, and explicit limitations. Do not infer satisfaction, goal completion, or code quality from counts.

- [ ] **Step 4: Integrate local-only orchestration and coverage rendering**

Skip both estimation and `generateLlmInsights` when local-only is active. Render a Trust & Coverage card before narrative sections and embed coverage in JSON and terminal output.

- [ ] **Step 5: Run focused, full, and deterministic artifact tests**

Run: `node --test test/deterministic-insights.test.js test/cli.test.js test/report.test.js && npm test && npm run generate:test-report`

Expected: all tests pass and deterministic HTML/JSON are written.

- [ ] **Step 6: Commit**

Run: `git add lib/deterministic-insights.js lib/cli.js lib/report.js lib/types.d.ts test/deterministic-insights.test.js test/cli.test.js test/report.test.js test/fixtures/sample-report.js && git commit -m "feat: generate local trust-aware reports"`

### Task 4: Runtime contract and public documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Create: `docs/privacy-and-trust.md`
- Create: `docs/app-server-compatibility.md`
- Create: `docs/contributing-analyzers.md`
- Modify: `docs/interactive-flow.md`

**Interfaces:**
- Declares: Node.js `>=18.17.0`.
- Documents: data-source fallback, local-only mode, coverage semantics, redaction limits, deletion, model cost, and analyzer contribution rules.

- [ ] **Step 1: Add a failing package contract test**

Add `test/package-contract.test.js` asserting the runtime floor, published plugin files, and required contributor/privacy documentation.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --test test/package-contract.test.js`

Expected: failure on the old Node engine and missing files.

- [ ] **Step 3: Update metadata and documentation**

Document exact commands for app-server, legacy, local-only, estimate-only, redaction review, cache/report deletion, and non-goals. Explain that model narratives are interpretations and that deterministic metrics can still be incomplete.

- [ ] **Step 4: Run contract and canonical checks**

Run: `node --test test/package-contract.test.js && npm run check && npm test`

Expected: all checks pass without package-contract failures.

- [ ] **Step 5: Commit**

Run: `git add package.json package-lock.json README.md docs test/package-contract.test.js && git commit -m "docs: define insights trust and runtime contracts"`

### Task 5: Codex plugin and Insights skill

**Files:**
- Create: `plugin/codex-insights/.codex-plugin/plugin.json`
- Create: `plugin/codex-insights/skills/insights/SKILL.md`
- Create: `plugin/codex-insights/skills/insights/agents/openai.yaml`
- Create: `plugin/codex-insights/skills/insights/references/report-modes.md`
- Create: `plugin/codex-insights/scripts/run-insights.mjs`
- Create: `test/plugin-contract.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `$insights` skill with estimate, local-only, and model-assisted routes.
- Produces: plugin manifest name `codex-insights`, version matching the npm package base version, MIT license, and local script capability.
- Wrapper resolves a linked `codex-session-insights` binary first and falls back to the repository CLI when running from a checkout.

- [ ] **Step 1: Scaffold with the official plugin creator**

Run the bundled scaffold into `plugin/` with skills and scripts, then replace the scaffolded skill with the scoped Insights workflow. Do not create MCP or hook declarations.

- [ ] **Step 2: Write and run a failing plugin contract test**

Run: `node --test test/plugin-contract.test.js`

Expected: failure until manifest, skill metadata, wrapper, package publication list, and no-placeholder requirements are satisfied.

- [ ] **Step 3: Implement wrapper and skill instructions**

The skill inspects availability, runs estimate first for model-assisted analysis, defaults to local-only when the user asks for private/offline analysis, and never shares or applies report recommendations without authorization.

- [ ] **Step 4: Validate skill and plugin**

Run the official `quick_validate.py` on `plugin/codex-insights/skills/insights`, `validate_plugin.py` on `plugin/codex-insights`, the wrapper against a synthetic Codex home, and `node --test test/plugin-contract.test.js`.

Expected: all validators and tests pass.

- [ ] **Step 5: Commit**

Run: `git add plugin package.json package-lock.json test/plugin-contract.test.js && git commit -m "feat: package Codex Insights plugin"`

### Task 6: End-to-end verification, local installation, and contribution handoff

**Files:**
- Create: `docs/upstream-rfc.md`
- Create: `docs/release-checklist.md`
- Modify: `README.md`

**Interfaces:**
- Installs: local CLI link, personal marketplace entry, and `codex-insights` plugin.
- Verifies: live app-server local-only report, synthetic legacy fallback report, plugin discovery, package contents, and full checks.
- Prepares: community PR and native Codex RFC without claiming upstream acceptance.

- [ ] **Step 1: Write contribution and release documentation**

Describe the stable schema, privacy gates, compatibility matrix, remaining repository-analysis phases, and the upstream request for a reserved native `/insights` command.

- [ ] **Step 2: Run complete repository verification**

Run: `npm test && npm run check && npm run generate:test-report && npm pack --dry-run`.

Expected: exit 0, no test failures, and plugin files included in the package preview.

- [ ] **Step 3: Exercise both data sources without model calls**

Run a synthetic legacy fixture and a bounded live app-server report with `--local-only --no-open`. Inspect generated JSON for coverage, fallback warnings, redaction counts, analysis mode, and absence of seeded secrets.

- [ ] **Step 4: Install and verify locally**

Run `npm link`, create or update the personal marketplace with the official plugin-creator flow, install `codex-insights@personal`, then verify `codex plugin list` and the installed skill directory. Start a new task boundary for product pickup.

- [ ] **Step 5: Perform broad branch review and address findings**

Review the full branch diff against the specification, run any focused regression tests for fixes, and rerun the complete verification command.

- [ ] **Step 6: Prepare the community contribution**

Fork the repository under the authenticated user if needed, push the verified feature branch, and open a pull request summarizing behavior, tests, privacy implications, compatibility, and non-goals. Do not publish npm or claim upstream merge.

- [ ] **Step 7: Commit documentation changes**

Run: `git add README.md docs && git commit -m "docs: prepare Codex Insights contribution"`
