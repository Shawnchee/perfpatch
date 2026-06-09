# PRD: `perfpatch` — Agentic Frontend Health CLI
**Version:** 1.0
**Status:** Ready for agent implementation
**Last updated:** June 2026

---

## 1. Overview

### What is this?
`perfpatch` is an open-source CLI tool and MCP server that audits a frontend project across three dimensions — runtime performance (Lighthouse), bundle bloat, and dead code — then uses Claude to generate and optionally apply the actual code fixes. It closes the loop existing tools leave open.

### One-liner
> "Run one command. Get your Lighthouse score, bundle waste, and dead code diagnosed and fixed — automatically."

### Why now?
- `lighthouse-mcp` (the closest competitor) has 145 stars and stops at reporting. No auto-fix.
- Devs in 2026 know what's broken. They don't have time to manually translate audit output into code changes.
- Claude Code + MCP is now a standard dev workflow. A tool built for this surface has natural distribution.

---

## 2. Target Users

**Primary:** Solo developers and small teams (1–5 devs) building with Next.js, Astro, Remix, or Vite.

**Secondary:** Devs using Claude Code, Cursor, or any MCP-compatible editor who want Lighthouse + fix in their IDE.

**NOT targeting (v1):**
- Enterprise teams with complex monorepos
- Sites behind authentication
- Non-JS/TS projects
- Mobile apps

---

## 3. Core Problem Statement

Lighthouse tells you your LCP is 4.2s. You still have to:
1. Understand what audit is causing it
2. Google the fix
3. Find the right file in your project
4. Write the code
5. Re-run to verify

No tool does steps 2–5. `perfpatch` does.

---

## 4. User Flows

### Flow A — URL audit (deployed site)
```
npx perfpatch https://yoursite.com
```
1. Detects stack from URL response headers + HTML hints
2. Runs Lighthouse (headless Chrome, local — no Google API)
3. Triages top 5 issues by impact × fixability score
4. Calls Claude API with audit data + stack context
5. Prints ranked fixes with code snippets to terminal
6. Optionally: asks to apply patches if project path is provided

### Flow B — Local project audit (codebase)
```
npx perfpatch --local ./my-project
```
1. Detects stack from package.json, config files
2. Runs bundle scan (reads build output or estimates from deps)
3. Runs Knip for dead code / unused deps
4. Calls Claude API with combined findings
5. Prints fixes with exact file paths and diffs
6. Prompts `Apply fix to src/app/page.tsx? [y/n]`
7. Re-runs relevant check after applying, shows before/after delta

### Flow C — Full audit (URL + codebase together)
```
npx perfpatch https://yoursite.com --local ./my-project
```
Combines both — correlates Lighthouse findings with bundle/dead code findings for deeper fixes.

### Flow D — MCP (Claude Code / Cursor)
User types in Claude Code: _"audit my site and fix the LCP issue"_
Agent calls:
- `run_lighthouse_audit(url)`
- `scan_bundle(project_path)`
- `run_dead_code_scan(project_path)`
- `generate_fixes(audit_results, stack_context)`
- `apply_fix(fix_id, project_path)`
- `verify_fix(url, metric)`

---

## 5. CLI Interface (full spec)

```bash
# Basic URL audit
npx perfpatch https://yoursite.com

# Local codebase only
npx perfpatch --local ./

# Full audit (URL + local)
npx perfpatch https://yoursite.com --local ./

# Flags
--stack <name>          # skip auto-detect. values: nextjs | astro | remix | vite | generic
--dry-run               # show fixes but don't write any files
--apply                 # apply all fixes without y/n prompts
--category <name>       # only run one auditor. values: perf | bundle | deadcode | all (default)
--output <format>       # terminal (default) | json | markdown
--save ./report.md      # save output to file
--anthropic-key <key>   # override ANTHROPIC_API_KEY env var
--no-ai                 # run audits only, no AI fix generation (useful for CI score checks)
--budget perf=90        # fail with exit code 1 if score below threshold (CI use)
--mobile                # run Lighthouse in mobile mode (default: desktop)
--verbose               # show full audit JSON, all issues not just top 5
```

---

## 6. MCP Server Interface (full spec)

> **v0.1 change:** `generate_fixes` (which called the Claude API) is replaced by
> `suggest_fixes` (returns deterministic fixes + a brief; the host model does the
> reasoning) and `apply_patch` (applies a diff the host model authored). No API
> key is used by the server. The signatures below describe the original design.

Exposed tools (for Claude Code, Cursor, Cline, etc.):

```typescript
run_lighthouse_audit(
  url: string,
  categories?: ('performance' | 'accessibility' | 'seo' | 'best-practices')[],
  device?: 'desktop' | 'mobile',
  throttling?: boolean
) → LighthouseAuditResult

scan_bundle(
  project_path: string,
  stack?: StackType
) → BundleScanResult  // top heavy deps, duplicates, estimated savings

run_dead_code_scan(
  project_path: string
) → DeadCodeResult  // unused files, deps, exports via Knip

detect_stack(
  project_path: string
) → StackInfo  // framework, bundler, CSS approach, Node version

generate_fixes(
  audit_results: AuditResults,
  stack_info: StackInfo,
  file_context?: FileContext[]  // optional: pass relevant file contents
) → Fix[]  // ranked list with code patches

apply_fix(
  fix_id: string,
  project_path: string,
  dry_run?: boolean
) → ApplyResult  // diff applied, files changed

verify_fix(
  url: string,
  metric: MetricName,
  baseline: number
) → VerifyResult  // new score, delta, pass/fail
```

---

## 7. Technical Architecture

### Stack
- **Language:** TypeScript (strict mode)
- **Node requirement:** 22+ (LTS)
- **Package manager:** supports npm / pnpm / bun
- **Distribution:** npm as `perfpatch` (npx-runnable, no global install needed)
- **License:** MIT

### Core modules

```
perfpatch/
├── src/
│   ├── cli.ts                  # CLI entrypoint, arg parsing (use commander or yargs)
│   ├── mcp.ts                  # MCP server entrypoint (@modelcontextprotocol/sdk)
│   │
│   ├── auditors/
│   │   ├── lighthouse.ts       # Runs Lighthouse via npm package + chrome-launcher
│   │   ├── bundle.ts           # Reads build output or node_modules, finds heavy deps
│   │   └── deadcode.ts         # Wraps knip programmatic API
│   │
│   ├── stack-detect.ts         # Reads package.json, config files → StackInfo
│   ├── triage.ts               # Scores issues: impact (1-10) × fixability (1-10)
│   │
│   ├── ai/
│   │   ├── fix-gen.ts          # Calls Claude API, returns structured Fix[]
│   │   ├── prompts/
│   │   │   ├── system.md       # Base system prompt
│   │   │   ├── nextjs.md       # Next.js-specific fix knowledge
│   │   │   ├── astro.md
│   │   │   ├── remix.md
│   │   │   ├── vite.md
│   │   │   └── generic.md
│   │   └── models.ts           # TypeScript types for AI I/O
│   │
│   ├── patcher/
│   │   ├── apply.ts            # Applies code patches to files (uses ts-morph or simple regex)
│   │   └── diff.ts             # Generates unified diffs for display
│   │
│   ├── verify.ts               # Re-runs specific metric, compares to baseline
│   ├── reporter.ts             # Formats output: terminal / JSON / markdown
│   └── types.ts                # All shared TypeScript types
│
├── tests/
│   ├── fixtures/               # Sample Lighthouse JSON, package.json files for testing
│   └── *.test.ts
│
├── package.json
├── tsconfig.json
└── README.md
```

### Key dependencies
```json
{
  "lighthouse": "^12.x",
  "chrome-launcher": "^0.15.x",
  "knip": "^5.x",
  "@modelcontextprotocol/sdk": "^1.x",
  "commander": "^12.x",
  "@anthropic-ai/sdk": "^0.x",
  "chalk": "^5.x",
  "ora": "^8.x",
  "execa": "^9.x"
}
```

---

## 8. The Three Auditors — Detailed Spec

### Auditor 1: Lighthouse (runtime performance)

**Input:** URL
**Chrome requirement:** Must have Chrome/Chromium installed. On first run, check and print a clear error if missing — do NOT silently fail.
**Output shape:**
```typescript
interface LighthouseAuditResult {
  scores: { performance: number; accessibility: number; seo: number; bestPractices: number }
  metrics: { lcp: number; cls: number; inp: number; fcp: number; tbt: number; tti: number }
  failingAudits: FailingAudit[]  // only audits with score < 0.9
  rawJson: object  // full Lighthouse output, stored but not displayed by default
}
```
**Triage logic:** Score each failing audit by:
- `impact` = Lighthouse weight × (1 - current score)
- `fixability` = hardcoded per audit type (image issues = 9, unused JS = 8, render-blocking = 7, fonts = 6, etc.)
- `priority` = impact × fixability, descending

**Important edge cases:**
- Site returns 404/500 → print clear error, exit 1
- Site has CSP blocking headless Chrome → warn user, results may be incomplete
- Localhost URLs → skip HTTPS check
- Very slow sites (>30s) → set Lighthouse timeout to 60s, warn user

---

### Auditor 2: Bundle Scanner

**Input:** project directory path
**Strategy (in order of preference):**
1. If `.next/` exists → parse Next.js build manifest (`build-manifest.json`, `app-build-manifest.json`)
2. If `dist/` or `build/` exists → scan JS files, sum sizes, cross-ref with source-map-explorer if available
3. If no build output → analyze `node_modules` directly using `bundlephobia`-style size estimation from package.json

**Output shape:**
```typescript
interface BundleScanResult {
  totalEstimatedSize: number  // bytes
  heavyDeps: HeavyDep[]      // sorted by size desc, top 10
  duplicateDeps: DupDep[]    // same package, multiple versions
  recommendations: string[]   // e.g. "replace moment with date-fns: saves ~67KB"
}
```

**Known substitutions to hardcode** (common, high-value swaps):
```
moment → date-fns or dayjs (saves ~230KB)
lodash → lodash-es or native (saves ~70KB)
axios → native fetch (saves ~40KB)
uuid → crypto.randomUUID() (saves ~8KB)
classnames → clsx (saves ~2KB, fast)
react-icons (full) → specific icon imports (saves ~500KB+)
```

---

### Auditor 3: Dead Code (Knip)

**Input:** project directory path
**Run via:** Knip programmatic API (not shell exec — use the Node API for structured output)
**Output shape:**
```typescript
interface DeadCodeResult {
  unusedFiles: string[]
  unusedDependencies: string[]       // in package.json but never imported
  unusedDevDependencies: string[]
  unusedExports: UnusedExport[]      // file + export name
  unlisted: string[]                 // imported but not in package.json
}
```

**Important:** Knip has false positives. Before surfacing to user:
- Filter out test files, storybook files, config files unless explicitly in scope
- If `unusedFiles` has >20 items, summarize rather than listing all — likely a misconfigured entry point
- Always show the Knip confidence alongside findings

---

## 9. AI Fix Generation — Detailed Spec

> **v0.1 architecture change (no external API).** perfpatch makes **zero** LLM
> API calls. Fix generation is split in two:
> 1. **Deterministic fixes** (`src/ai/rule-fixes.ts`) — mechanical changes
>    (e.g. removing unused dependencies) generated and applied by the tool
>    itself, no model involved.
> 2. **Contextual fixes** — written as a markdown **fix brief**
>    (`src/ai/brief.ts`, default `perfpatch-fixes.md`) that the user hands to
>    the LLM they already have (their IDE agent), or that the MCP host model
>    receives via `suggest_fixes`. That model does the reasoning and applies
>    edits through `apply_patch`.
>
> The original API-based design below is kept for historical context; the
> `Fix` JSON shape it specifies is still the schema rule-fixes and the brief
> use. There is no `ANTHROPIC_API_KEY`, `--anthropic-key`, or `--no-ai`.

### Claude API call (superseded — not implemented)
- **Model:** `claude-sonnet-4-20250514`
- **Max tokens:** 4096
- **Temperature:** 0 (deterministic fixes)

### System prompt structure
```
You are a frontend performance engineer. You will receive:
1. Audit results (Lighthouse scores, bundle analysis, dead code findings)
2. Stack information (framework, bundler, versions)
3. Optionally: relevant file contents

Output ONLY a JSON array of Fix objects. No prose, no markdown, no explanation outside the JSON.

Each Fix must have:
- id: string (unique slug)
- title: string (short, ≤60 chars)
- category: "performance" | "bundle" | "deadcode"
- impact: "high" | "medium" | "low"
- effort: "low" | "medium" | "high"
- file_path: string | null  (null if fix is config/dependency change)
- patch: string | null  (unified diff format, or null if it's a command to run)
- command: string | null  (e.g. "npm uninstall moment && npm install dayjs")
- explanation: string  (1–2 sentences max, plain English)
- metric_affected: string  (e.g. "LCP", "bundle size", "TTI")
- estimated_saving: string  (e.g. "~200ms LCP improvement", "~67KB bundle reduction")
```

### File context strategy
Do NOT send entire files to Claude. Instead:
1. For Lighthouse issues → extract only the relevant component/page file (top 100 lines around the LCP element if identifiable)
2. For bundle issues → send package.json dependencies section only
3. For dead code → send the list of unused items only

This keeps tokens low and fixes precise.

### Fix ranking for display
Sort output by: `(impact_score × effort_inverse)` where high impact + low effort = first.

---

## 10. Patch Application — Detailed Spec

### Safety rules (non-negotiable)
1. **Always create a backup** before applying any patch: copy file to `{filename}.perfpatch-backup`
2. **Never apply to files outside the specified project path** — prevent path traversal
3. **Never modify `node_modules`**, `*.lock` files, or `.git/`
4. **Dry-run by default** — require explicit `--apply` or `[y]` confirmation per file
5. **Show the full diff** before asking for confirmation
6. **If patch fails to apply cleanly** → skip it, print warning, do not partial-apply

### Patch format
Use unified diff format. Apply with a JS diff/patch library (e.g. `diff` npm package), not shell `patch` command, for cross-platform compatibility.

### After applying
- Run the relevant auditor again on just the affected metric
- Show: `✓ LCP: 4.2s → 1.9s (-55%)`
- If score got worse → offer to revert from backup automatically

---

## 11. Stack Detection — Detailed Spec

```typescript
interface StackInfo {
  framework: 'nextjs' | 'astro' | 'remix' | 'vite' | 'create-react-app' | 'nuxt' | 'generic'
  frameworkVersion: string | null
  bundler: 'webpack' | 'vite' | 'turbopack' | 'rspack' | 'esbuild' | 'unknown'
  cssApproach: 'tailwind' | 'css-modules' | 'styled-components' | 'emotion' | 'plain-css' | 'unknown'
  imageLib: 'next/image' | 'astro:assets' | 'cloudinary' | 'imgix' | 'plain-img' | 'unknown'
  typescript: boolean
  nodeVersion: string
  packageManager: 'npm' | 'pnpm' | 'bun' | 'yarn'
}
```

Detection logic (check in order):
1. `next.config.js` / `next.config.ts` → nextjs
2. `astro.config.mjs` → astro
3. `remix.config.js` / `vite.config.ts` + `@remix-run` in deps → remix
4. `vite.config.ts` alone → vite
5. `react-scripts` in deps → create-react-app
6. `nuxt.config.ts` → nuxt
7. Fallback → generic

---

## 12. Output Format — Terminal

Use color + structure. Example output:

```
perfpatch v0.1.0

🔍 Auditing https://dailyscaffold.com
   Stack detected: Next.js 14.2, Tailwind CSS, TypeScript

Running audits...
  ✓ Lighthouse        61 perf  96 a11y  100 seo  92 bp   (8.2s)
  ✓ Bundle scan       196KB JS transferred, 3 heavy deps found  (2.1s)
  ✓ Dead code         11 unused deps, 22KB wasted polyfills  (3.4s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 HIGH IMPACT  (fix these first)

[1] Add fetchpriority to hero image                        ~800ms LCP
    File: src/app/page.tsx
    Effort: LOW — 1 line change
    > Show fix  [y/n]

[2] Remove moment.js, replace with date-fns               ~230KB bundle
    Command: npm uninstall moment && npm install date-fns
    Effort: LOW — swap import in 2 files
    > Show fix  [y/n]

[3] Disable legacy JS polyfills (Baseline 2022 features)   ~22KB bundle
    File: next.config.ts
    Effort: LOW — 3 line config change
    > Show fix  [y/n]

🟡 MEDIUM IMPACT

[4] Defer non-critical CSS                                 ~190ms FCP
[5] Remove 11 unused npm dependencies                      ~18KB bundle

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Projected after fixes: perf 61 → ~85  |  bundle 196KB → ~112KB
Run with --apply to patch all automatically.
```

---

## 13. Error Handling — What to Get Right

These are the most common failure modes. Handle all of them explicitly:

| Scenario | Handling |
|---|---|
| Chrome not installed | Print install instructions for Mac/Windows/Linux. Exit 1 with clear message. |
| `ANTHROPIC_API_KEY` not set | Print: "Set ANTHROPIC_API_KEY env var or pass --anthropic-key. Get a key at console.anthropic.com". Exit 1. |
| URL is localhost but no server running | Try to connect, timeout after 5s, print "Is your dev server running?" |
| Site behind auth / returns 403 | Print: "perfpatch can't audit authenticated pages in v1. Try --local for codebase analysis." |
| Knip finds 0 issues | Print "✓ No dead code found" — don't treat as error |
| No package.json in --local path | Print: "No package.json found. Is this the root of a JS/TS project?" |
| Claude API rate limit | Retry once after 10s with exponential backoff. If still failing, print raw audit results without AI fixes. |
| Claude API returns malformed JSON | Catch parse error, fall back to printing raw audit without fixes, log warning |
| Patch conflicts with existing code | Skip patch, print: "Could not apply fix [1] cleanly — manual fix required. See explanation above." |
| Very large project (>500 files) | Warn user Knip scan may take 30–60s. Show spinner. Don't timeout. |

---

## 14. v1 Scope — What to Build

### Must have (ship these)
- [ ] CLI: URL audit with Lighthouse
- [ ] CLI: `--local` codebase scan (bundle + dead code)
- [ ] Stack detection (Next.js, Astro, Vite, generic)
- [ ] AI fix generation via Claude API (dry-run, printed to terminal)
- [ ] MCP server with `run_lighthouse_audit` + `generate_fixes` tools
- [ ] `ANTHROPIC_API_KEY` env var support
- [ ] `--no-ai` mode (audit only, no Claude call — useful for CI)
- [ ] JSON output mode (`--output json`) for piping/scripting
- [ ] README with install instructions, GIF demo, example output
- [ ] Basic test suite with fixture data (no real Chrome needed for unit tests)

### Nice to have (v1 if time allows)
- [ ] `--apply` flag with confirmation prompts
- [ ] Backup + revert on failed patch
- [ ] `verify_fix` MCP tool

### Out of scope for v1
- [ ] Authenticated page audits
- [ ] Multi-page crawl
- [ ] CI regression tracking / score history
- [ ] GitHub Action
- [ ] Web UI
- [ ] Non-JS/TS project support

---

## 15. What the Agent Must NOT Do

These are the landmines. Avoid all of them:

1. **Do not shell-exec Knip** — use its programmatic Node API. Shell exec breaks on Windows and is harder to parse.
2. **Do not require global Chrome install path** — use `chrome-launcher` which auto-detects Chrome on all platforms.
3. **Do not send full file contents to Claude** — extract only relevant sections. Full files will blow the context window and cost too much.
4. **Do not apply patches without showing the diff first** — non-negotiable. Users must see what changes before files are touched.
5. **Do not assume Next.js** — stack detection must run first. Generic mode must work acceptably.
6. **Do not fail silently** — every error must print a human-readable message. No unhandled promise rejections, no empty output.
7. **Do not block on Lighthouse if `--local` only is specified** — the two audit paths are independent.
8. **Do not hardcode the Anthropic model string** — put it in a config constant so it's one-line to update.
9. **Do not use CommonJS** — ESM only. The ecosystem (chalk, ora, etc.) has moved on.
10. **Do not invent fixes** — if Claude returns a fix with no `file_path` and no `command`, discard it. Vague suggestions are noise.

---

## 16. Testing Strategy

### Unit tests (required for v1)
- `stack-detect.ts` — test with fixture package.json files for each framework
- `triage.ts` — test scoring logic with sample failing audits
- `fix-gen.ts` — mock Claude API, test JSON parse + fallback behavior
- `bundle.ts` — test with fixture build manifests
- `reporter.ts` — test terminal output formatting

### Integration tests (run against real URLs, optional in CI)
- Use `https://example.com` as a stable test URL for Lighthouse
- Use a fixture Next.js project in `tests/fixtures/nextjs-app/` for local audit tests

### Manual testing checklist before ship
- [ ] Works on macOS (Apple Silicon)
- [ ] Works on macOS (Intel)
- [ ] Works on Ubuntu (GitHub Actions runner)
- [ ] Works on Windows (PowerShell)
- [ ] `npx perfpatch` works without global install
- [ ] MCP config works in Claude Desktop
- [ ] MCP config works in Cursor

---

## 17. Publishing & Distribution

```bash
# package.json
{
  "name": "perfpatch",
  "version": "0.1.0",
  "bin": {
    "perfpatch": "./dist/cli.js"
  },
  "type": "module",
  "engines": { "node": ">=22" },
  "files": ["dist/", "README.md"]
}
```

- Publish to npm as `perfpatch` (check name availability first — alternatives: `lhfix`, `auditfix`, `perfagent`)
- GitHub repo: `github.com/[yourname]/perfpatch`
- README must include: one-line install, animated GIF demo, example terminal output, MCP config JSON snippet
- Add to MCP Registry (`modelcontextprotocol.io/registry`) on launch for discovery
- Post to: r/webdev, r/nextjs, Dev.to, Hacker News Show HN

---

## 18. Success Metrics (how you'll know v1 worked)

- 100+ npm downloads in first week
- 50+ GitHub stars in first month
- At least one person posts "it fixed my LCP" on Twitter/X
- MCP server listed in official MCP registry
- Works end-to-end on the `dailyscaffold.com` Lighthouse report from this conversation

---

## Appendix: Relevant Links for the Agent

- Lighthouse npm API: https://github.com/GoogleChrome/lighthouse/blob/main/docs/readme.md
- chrome-launcher: https://github.com/GoogleChrome/chrome-launcher
- Knip programmatic API: https://knip.dev/reference/api
- MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Anthropic SDK: https://github.com/anthropic-ai/anthropic-node
- Competitor reference (do not copy): https://github.com/priyankark/lighthouse-mcp
