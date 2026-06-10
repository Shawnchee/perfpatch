<p align="center">
  <img src="assets/logo.png" alt="perfpatch" width="180">
</p>

<h1 align="center">perfpatch</h1>

> Run one command. Get your Lighthouse score, bundle waste, and dead code diagnosed **and fixed** — using the LLM you already have. No API key, no extra cost.

`perfpatch` is a CLI tool and MCP server that audits a frontend project across three dimensions — runtime performance (Lighthouse), bundle bloat, and dead code — then **does the deterministic fixes itself** and hands the contextual code fixes to whatever LLM you already use (Claude Code, Cursor, …). It makes **zero external API calls**.

- 🔦 **Lighthouse** runtime audit (local headless Chrome — no Google API)
- 📦 **Bundle scan** — heavy deps, duplicates, high-value substitutions
- 🧹 **Dead code** via [Knip](https://knip.dev)'s programmatic API
- 🔧 **Deterministic fixes** applied directly (e.g. remove unused deps) — no LLM needed
- 🧠 **A fix brief** for the contextual code changes — paste into your IDE agent, or
- 🔌 **MCP server** so your IDE's Claude drives the audits + applies patches for free

### How fixes work (no API key)

`perfpatch` never calls an LLM API. Instead:

1. **Deterministic fixes** (unused-dependency removals, etc.) are generated and applied by the tool itself.
2. **Contextual fixes** (LCP image tweaks, dependency swaps with import rewrites, config tuning) are written to a **fix brief** (`perfpatch-fixes.md`) — a ready-to-act prompt you drop into Claude Code / Cursor. Your existing LLM makes the edits.
3. Even better: add the **MCP server** to your IDE. Then your agent calls the audit tools, reads the findings, edits files, and applies patches through `apply_patch` — all on your existing Claude, no separate key.

---

## Install / run

> ⚠️ **Not published to npm yet.** `npx perfpatch` won't work until it's
> released. For now, run it from source (below). The `npx`/`npm install`
> commands elsewhere in this README describe the eventual published flow.

Requires **Node 22+** and **Chrome/Chromium** (for URL audits only). **No API key required.**

Run from source:

```bash
git clone https://github.com/Shawnchee/perfpatch.git
cd perfpatch
npm install
npm run build

# Then run the built CLI:
node dist/cli.js https://yoursite.com
node dist/cli.js --local /path/to/your-project

# …or run straight from TypeScript without building:
npm run dev -- --local /path/to/your-project
```

(Optional) link it so `perfpatch` works as a global command on your machine:

```bash
npm link            # in the perfpatch repo
perfpatch --local /path/to/your-project
```

---

## Usage

> Examples use `perfpatch …`; until it's on npm, substitute `node dist/cli.js …`
> (or `npm run dev -- …`) from the cloned repo.

```bash
# Audit a deployed URL
perfpatch https://yoursite.com

# Audit a local codebase (bundle + dead code)
perfpatch --local ./

# Both — correlate runtime + codebase findings
perfpatch https://yoursite.com --local ./

# Audit your running dev server (include the scheme!)
perfpatch http://localhost:3000 --local ./
```

### Auditing a local dev server

You can point `perfpatch` at `http://localhost:3000` (or any port) while your
dev server is running:

- **Include the scheme** — `http://localhost:3000`, not bare `localhost:3000`.
- **Pair it with `--local ./`** so you also get bundle/dead-code analysis and
  real stack detection (a URL-only audit can only see the rendered page).
- **For trustworthy perf scores, audit a production build**, not the dev server
  — `next dev` / `vite` are unminified and carry HMR overhead, so scores look
  worse than reality. Run e.g. `next build && next start` (or `vite preview`)
  and audit that port. Bundle/dead-code analysis is accurate either way.

### Flags

| Flag | Description |
|---|---|
| `--local <path>` | Audit a local codebase (bundle + dead code) |
| `--stack <name>` | Skip auto-detect: `nextjs` \| `astro` \| `remix` \| `vite` \| `generic` |
| `--dry-run` | Show fixes but don't write any files |
| `--apply` | Apply deterministic fixes without per-item prompts |
| `--category <name>` | `perf` \| `bundle` \| `deadcode` \| `all` (default) |
| `--output <format>` | `terminal` (default) \| `json` \| `markdown` |
| `--save <path>` | Save the report to a file |
| `--prompt <path>` | Where to write the LLM fix brief (default `perfpatch-fixes.md`) |
| `--no-prompt` | Don't write the fix brief |
| `--budget <expr>` | Fail with exit 1 if score below threshold, e.g. `perf=90` (CI) |
| `--mobile` | Run Lighthouse in mobile mode (default: desktop) |
| `--verbose` | Show full audit data, not just the top issues |

---

## Example output

```
perfpatch v0.1.0

🔍 Auditing https://yoursite.com
   Stack: nextjs 14.2.0, tailwind, TypeScript

  ✓ Lighthouse    61 perf   96 a11y  100 seo   92 bp
  ✓ Bundle        196KB JS, 3 heavy dep(s), 0 duplicate(s)
  ✓ Dead code     11 unused dep(s), 0 unused file(s), 4 unused export(s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 HIGH IMPACT  (fix these first)

[1] Add fetchpriority to hero image                ~800ms LCP
    File: src/app/page.tsx
    Effort: LOW — set fetchpriority="high" on the LCP image.

[2] Replace moment with dayjs                       ~230KB bundle
    Command: npm uninstall moment && npm install dayjs
    Effort: LOW — moment is large and not tree-shakeable.
```

---

## CI usage

```bash
# Fail the build if performance drops below 90 (no fix brief written)
npx perfpatch https://staging.yoursite.com --no-prompt --budget perf=90
```

`--output json` emits a machine-readable report on stdout for piping.

---

## MCP server

`perfpatch` ships an MCP server exposing each capability as a tool:
`run_lighthouse_audit`, `scan_bundle`, `run_dead_code_scan`, `detect_stack`,
`suggest_fixes`, `apply_fix`, `apply_patch`, `verify_fix`.

Crucially, **the server does not call any LLM API** — your IDE's agent (the host
model) reads the audits and does the reasoning. `suggest_fixes` returns the
deterministic fixes plus a brief describing what to change; the agent edits files
and applies its diffs through `apply_patch` (which backs up, validates the path,
and never partial-applies).

Add to your MCP client config (Claude Desktop / Cursor / Claude Code) — no key.

**From source (current — not on npm yet):** build first (`npm install && npm run
build`), then point the client at the built server with an absolute path:

```json
{
  "mcpServers": {
    "perfpatch": {
      "command": "node",
      "args": ["/absolute/path/to/perfpatch/dist/mcp.js"]
    }
  }
}
```

**Once published to npm**, this becomes:

```json
{
  "mcpServers": {
    "perfpatch": {
      "command": "npx",
      "args": ["-y", "perfpatch", "--mcp"]
    }
  }
}
```

Then, in your editor: _"audit my site and fix the LCP issue"_ — the agent calls
the tools, makes the edits itself, and applies patches with your confirmation.

---

## Safety

Patch application is deliberately conservative:

- **Dry-run by default** — `--apply` or a per-file `[y/n]` is required.
- **Always shows the full diff** before touching a file.
- **Backs up** every file to `{file}.perfpatch-backup` before writing.
- **Never** writes outside the project, or into `node_modules`, lockfiles, or `.git/`.
- **Never partial-applies** — a patch that doesn't apply cleanly is skipped.

---

## Development

```bash
npm install
npm run dev -- --local ./           # run the CLI from source
npm run mcp                         # run the MCP server from source
npm test                            # unit tests (no Chrome needed)
npm run typecheck
npm run build                       # emit dist/ + copy prompts
```

## License

MIT
