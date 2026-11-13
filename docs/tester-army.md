# Tester Army end-to-end coverage

Run `npm run test:tester-army` with a supported Node version (`^22.22.2 || ^24.15.0 || >=26.0.0`) and `sqlite3` on PATH.
The production CLI uses that Node range; development test tooling requires Node 22.22.3+ on the Node 22 line. Test tooling is a development
dependency pinned to `e2e` 0.23.0 and `@e2e-dev/web` 0.15.5. Install Chromium
with `npx playwright install chromium` (CI adds `--with-deps`).

The suite currently contains 20 journeys (13 CLI and 7 browser).

The official runner executes real CLI subprocesses through a tools-only target,
and real generated report and profile HTML through its web engine. These are
deterministic journeys; no agent model is configured and there are zero provider
calls. The existing Node regression suite remains available through `npm test`.

Every CLI run receives a temporary synthetic Codex home. A synthetic SQLite index
and synthetic rollout messages exercise the actual legacy data reader. Public
profile exports use the existing `test/fixtures/sample-report.js` fixture. Tests
never read the developer's private Codex home. All temporary input, cache and
exports are removed after tests. The web command serves only fixture exports,
binds loopback, and stops with the runner. Override its default port using, for
example, `INSIGHTS_E2E_URL=http://127.0.0.1:4327 npm run test:tester-army`.

| Surface | Executed postconditions |
| --- | --- |
| Help/version | CLI exits successfully, documents local-only mode, returns version |
| Offline generation | SQLite and rollouts read, one substantive session exported, JSON stdout parses, HTML exists, timestamp copies created, private file permissions |
| Repeat generation/cache | Same fixture remains in report on a second run |
| Estimate | Estimate prints; no report generated |
| Explicit export/locale/filter | Custom JSON/HTML paths, Chinese document language, empty date scope and reanalysis |
| Local profile | Name rendered, JSON and HTML generated, private title/path excluded |
| Validation/errors | Unknown argument, conflicting filters/modes, bad provider, missing home/report, unsafe repository fail with messages |
| Report reader | Generated project stats rendered and work-section navigation works |
| Profile reader | Daily/weekly/cumulative tabs select exactly one panel; Copy link handles browser result |
| Report recommendations | Check/uncheck recommendations and execute individual/bulk copy with success or explicit unavailable status |
| Responsive reader | Both report and profile render at 375px and 1440px with no horizontal overflow |

Authenticated Codex app-server/account profile, model-assisted narrative generation,
GitHub publication, self-update installation, OS browser launching, and launch-agent
installation/removal require external accounts, model calls, OS integration or
external writes. This suite does not claim live coverage of those paths; existing
regression tests cover their isolated contracts. No live accounts or publication
are invoked. Browser clipboard success or supported fallback is checked; this does
not assert OS clipboard contents. The generated pages have no theme toggle; this
suite checks their default appearance and responsive layout.

CI runs the suite as a separate Node 22 job and uploads `.e2e/` diagnostics on
success or failure. Locally inspect `.e2e/report.json` and failure artifacts.

## Telemetry and platforms

Standard test commands and CI set `E2E_TELEMETRY_DISABLED=1`. Commands use POSIX environment assignment (macOS/Linux). On Windows PowerShell, set `$env:E2E_TELEMETRY_DISABLED="1"` and run `npx e2e run`. No global settings are changed.
