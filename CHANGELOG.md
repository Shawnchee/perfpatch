# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0]

Triage is now grounded in the Lighthouse report's own measurements, and the
documented MCP setup actually works. (Folds in the unreleased 0.1.2 changes below.)

### Fixed
- **MCP setup instructions were broken for everyone.** The README told users to run
  `npx -y perfpatch-mcp`, but no npm package by that name exists — the MCP server is a
  *bin* inside the `perfpatch` package. The working config is
  `npx -y perfpatch --mcp` (both the JSON config and the `claude mcp add` one-liner
  are corrected).
- **Issue prioritization was effectively random for actionable audits.** In real
  Lighthouse reports, every opportunity/diagnostic has scoring weight 0, so the old
  `impact = weight × (1 − score)` formula gave `priority = 0` to *all* of them — the
  "top failing audits" order was arbitrary. Priority is now grounded in the report's
  own data: score gap + category weight (a11y/SEO/BP audits use their real category
  weights) + Lighthouse's own estimated savings (`metricSavings` /
  `overallSavingsMs` / `overallSavingsBytes`), × fixability. Ties break
  deterministically.
- **INP is no longer reported as `0`.** Lab Lighthouse cannot measure INP (it needs
  real user input); it is now `null` in JSON output, omitted from reports, removed
  from the MCP `verify_fix` metric choices, and `verify_fix` errors clearly instead
  of "verifying" against a fabricated 0. TTI is likewise `null` if a future
  Lighthouse drops the audit.
- **Duplicate findings from Lighthouse 12.6+ "insight" audits.** Lighthouse now runs
  new insight audits alongside the classic audits they replace, so the same problem
  appeared twice (e.g. `render-blocking-resources` + `render-blocking-insight`).
  When both twins fail, only the classic audit is reported.
- **A typo'd `--budget` metric silently passed CI.** Unknown metrics (e.g.
  `--budget pref=90`) now fail loudly instead of warning and exiting 0.
- **`--output json` stdout is now clean.** The budget pass message moved to stderr,
  so `perfpatch <url> --output json --budget perf=90 | jq` works.
- **Bot-protected sites no longer fail preflight.** The reachability check now sends
  a browser User-Agent, and 401/403 responses warn-and-continue (Cloudflare-style
  protection often blocks plain fetches while letting headless Chrome through);
  truly blocked pages are still caught via Lighthouse's runtime error.
- `--stack` and `--category` values are validated, and category/target combinations
  that would silently run nothing (e.g. `--category bundle` without `--local`) now
  error with an explanation.
- Patched a low-severity DoS advisory by upgrading `diff` 7 → 9 (perfpatch runs
  `applyPatch` on LLM-authored patches, where that advisory is actually relevant).

### Added
- **Top Lighthouse issues in the terminal and markdown reports** — previously the
  failing audits only landed in the fix brief; the report itself showed bare scores.
  Each issue line includes Lighthouse's estimated savings (`est. savings ~450ms /
  ~117KB`) — measured estimates from the run, not guesses.
- The fix brief now includes per-audit estimated savings so the IDE agent can
  prioritize by measured impact.
- The markdown report now includes metrics, top issues, the LCP element, heavy/
  duplicate dependencies, and the full dead-code section (it previously omitted
  dead code entirely).
- A clear error message if knip's programmatic API shape changes (instead of a
  cryptic `TypeError`).

### Removed
- Unused `execa` dependency and dead `run-command.ts` module (found by running
  perfpatch on itself).

## [0.1.2] (unreleased — folded into 0.2.0)

Accuracy fixes — findings on real sites were noisy or misleading. Verified against
a live Next.js production site (desktop perf corrected 69 → 99, matching Chrome
DevTools).

### Fixed
- **Desktop Lighthouse throttling.** A `desktop` audit was silently using Lighthouse's
  default *mobile* throttling (4× CPU slowdown, ~1.6 Mbps), scoring sites ~30 points too
  low. Desktop now uses the proper preset (1× CPU, 10 Mbps); mobile uses mobileSlow4G.
- **Dead-code false positives.** Files commonly loaded by means static analysis can't see
  — `public/` assets, `*.md`/`*.mdx` content, service workers, templates — are no longer
  presented as deletable. They move to a separate `possiblyUnusedFiles` bucket labelled
  "investigate — not safe to delete". Knip still auto-loads any per-project config.
- **"Unused exports" wording.** Relabelled to "not imported by any other module — you may
  be able to drop the `export` keyword; NOT necessarily dead", instead of implying deletion.
- **Framework-essential deps** (`react`, `react-dom`, `next`, …) are no longer listed as
  actionable "heavy dependencies".

### Added
- Lighthouse findings now name the actual **LCP element**, the failing **color-contrast
  nodes**, and the **redirect chain**, so fixes target the real element instead of guessing.
- `VERSION` is now read from `package.json` (single source of truth) so the banner can't drift.

## [0.1.1]

### Changed
- Docs: removed the "not published to npm yet" notices now that the package is
  live; `npx perfpatch` / `npm install -g perfpatch` are the primary install paths.
- Docs: MCP setup now leads with the published `npx -y perfpatch-mcp` config and
  the `claude mcp add` one-liner; running from source is shown as a fallback.
- Docs: clarified that `--apply` only applies file patches — dependency removals
  are always advisory and never auto-run.
- Refined the npm package description.

### Added
- This `CHANGELOG.md`.
- `CONTRIBUTING.md` with local dev, testing, and PR guidance.

## [0.1.0]

Initial public release.

### Added
- **Lighthouse** runtime audit via local headless Chrome (no Google API).
- **Bundle scan** — heavy dependencies, duplicate installed versions, and
  high-value substitution recommendations. Bundle size is reported as *measured*
  when build output exists, and clearly labelled a *worst-case estimate* otherwise.
- **Dead-code analysis** via [Knip](https://knip.dev)'s programmatic API — unused
  files, dependencies, exports, and imported-but-undeclared dependencies.
- **Fix brief** (`perfpatch-fixes.md`) — a stack-aware, ready-to-paste prompt for
  Claude Code / Cursor that describes the contextual code changes to make.
- **MCP server** exposing `run_lighthouse_audit`, `scan_bundle`,
  `run_dead_code_scan`, `detect_stack`, `suggest_fixes`, `apply_fix`,
  `apply_patch`, and `verify_fix`. Makes zero external LLM API calls.
- **Advisory mechanical fixes** — unused-dependency removals are surfaced as exact
  commands to review; perfpatch never runs them, because dead-code detection can
  produce false positives (e.g. deps used only via server components or dynamic
  imports).
- **Safe patcher** — backs up every file, refuses paths outside the project /
  `node_modules` / lockfiles / `.git`, and never partial-applies.
- **CI budget gate** — `--budget perf=90` exits non-zero on regression, and fails
  loudly (rather than silently passing) when Lighthouse could not run.
- Output formats: `terminal`, `json` (machine-readable, without the multi-hundred-KB
  raw Lighthouse report), and `markdown`.

[0.2.0]: https://github.com/Shawnchee/perfpatch/releases/tag/v0.2.0
[0.1.1]: https://github.com/Shawnchee/perfpatch/releases/tag/v0.1.1
[0.1.0]: https://github.com/Shawnchee/perfpatch/releases/tag/v0.1.0
