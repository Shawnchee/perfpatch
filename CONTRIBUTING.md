# Contributing to perfpatch

Thanks for your interest in improving perfpatch! This is a small, focused tool —
contributions that keep it sharp and honest are very welcome.

## Prerequisites

- **Node 22+**
- **Chrome / Chromium** — only needed to run Lighthouse (URL audits). Bundle and
  dead-code analysis, and the full test suite, run without it.

## Getting started

```bash
git clone https://github.com/Shawnchee/perfpatch.git
cd perfpatch
npm install
```

## Common scripts

```bash
npm run dev -- --local ./        # run the CLI from TypeScript (no build)
npm run dev -- https://example.com --local ./
npm run mcp                      # run the MCP server from source (stdio)
npm test                         # unit tests (Vitest, no Chrome needed)
npm run test:watch               # tests in watch mode
npm run typecheck                # tsc --noEmit
npm run build                    # emit dist/ and copy prompt files
```

Try a change end-to-end against a real project:

```bash
npm run build
node dist/cli.js https://yoursite.com --local /path/to/a/project --dry-run
```

## Project layout

```
src/
  cli.ts            # CLI entry + orchestration
  mcp.ts            # MCP server (stdio)
  auditors/         # lighthouse.ts, bundle.ts, deadcode.ts
  ai/               # brief.ts, rule-fixes.ts, models.ts, prompts/*.md
  patcher/          # apply.ts, diff.ts, run-command.ts
  reporter.ts       # terminal / json / markdown rendering
  triage.ts         # ranks Lighthouse audits by impact × fixability
  stack-detect.ts   # framework / bundler / CSS / package-manager detection
  verify.ts         # re-run a metric against a baseline
  types.ts          # shared types
tests/              # Vitest specs + fixtures
scripts/            # build helpers (copy-prompts.mjs)
```

## Guidelines

- **No external LLM API calls.** perfpatch's whole premise is zero API cost — the
  host model (your IDE's agent) does the reasoning. Keep it that way.
- **Be honest in output.** Prefer accurate, caveated findings over impressive-looking
  ones. Heuristics (bundle estimates, dead-code detection) must be labelled as such;
  destructive suggestions (e.g. `npm uninstall`) stay advisory, never auto-run.
- **Add or update tests** for any behaviour change. `npm test` and `npm run typecheck`
  must pass before you open a PR.
- **Match the surrounding style** — TypeScript, ES modules, small focused functions,
  comments that explain *why* rather than *what*.
- **Update `CHANGELOG.md`** under a new `## [Unreleased]` (or the next version)
  heading for any user-facing change.

## Submitting a PR

1. Fork and branch from `main` (e.g. `fix/bundle-estimate-label`).
2. Make the change, with tests.
3. Run `npm run typecheck && npm test && npm run build`.
4. Open a PR describing **what** changed and **why**. Screenshots or before/after
   CLI output are appreciated for output changes.

## Reporting bugs

Open an issue at https://github.com/Shawnchee/perfpatch/issues with:

- the command you ran (and whether `--local`, a URL, or both),
- the detected stack (top of the report),
- what you expected vs. what happened, and ideally the report output.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE).
