# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.1]: https://github.com/Shawnchee/perfpatch/releases/tag/v0.1.1
[0.1.0]: https://github.com/Shawnchee/perfpatch/releases/tag/v0.1.0
