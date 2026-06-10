import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { topIssues } from '../triage.js';
import type { AuditResults, FileContext, Fix, Framework, StackInfo } from '../types.js';

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'prompts');

/**
 * Deps that are framework-essential: they have no lighter substitution and can't
 * be removed, so listing them as "heavy" bloat is noise, not an actionable
 * finding. Keep this list narrow — only truly non-removable runtime cores.
 */
const NON_REMOVABLE_DEPS = new Set([
  'react',
  'react-dom',
  'next',
  'react/jsx-runtime',
  'scheduler',
]);

function loadPrompt(name: string): string {
  try {
    return readFileSync(join(PROMPTS_DIR, name), 'utf8');
  } catch {
    return '';
  }
}

function frameworkPromptFile(framework: Framework): string {
  switch (framework) {
    case 'nextjs':
      return 'nextjs.md';
    case 'astro':
      return 'astro.md';
    case 'remix':
      return 'remix.md';
    case 'vite':
      return 'vite.md';
    default:
      return 'generic.md';
  }
}

/** Framework-aware engineer instructions for an IDE agent that will apply fixes. */
export function buildInstructions(framework: Framework): string {
  const intro = loadPrompt('brief-intro.md');
  const fw = loadPrompt(frameworkPromptFile(framework));
  return fw ? `${intro}\n\n---\n\n${fw}` : intro;
}

/** Render the audit findings as readable markdown (not JSON dump). */
function renderFindings(audits: AuditResults): string {
  const parts: string[] = [];

  if (audits.lighthouse) {
    const lh = audits.lighthouse;
    parts.push('## Lighthouse');
    parts.push(
      `- URL: ${lh.url} (${lh.device})`,
      `- Scores: perf ${lh.scores.performance}, a11y ${lh.scores.accessibility}, seo ${lh.scores.seo}, best-practices ${lh.scores.bestPractices}`,
      `- Metrics: LCP ${Math.round(lh.metrics.lcp)}ms, FCP ${Math.round(lh.metrics.fcp)}ms, TBT ${Math.round(lh.metrics.tbt)}ms, CLS ${lh.metrics.cls.toFixed(3)}`,
      '',
      'Top failing audits (by impact × fixability):',
    );
    for (const a of topIssues(lh.failingAudits, 8)) {
      parts.push(`- **${a.title}** (${a.id}) — score ${(a.score * 100).toFixed(0)}${a.displayValue ? `, ${a.displayValue}` : ''}`);
    }

    if (lh.lcpElement) {
      parts.push(
        '',
        'LCP element (the element that finished painting last — optimize THIS one):',
        `  \`${lh.lcpElement}\``,
      );
    }

    if (lh.contrastIssues && lh.contrastIssues.length > 0) {
      parts.push('', 'Failing color-contrast nodes (fix the foreground/background of these specific elements):');
      for (const c of lh.contrastIssues) {
        const label = c.nodeLabel ? ` — "${c.nodeLabel}"` : '';
        parts.push(`  - \`${c.selector}\`${label}`);
        if (c.snippet && c.snippet !== c.selector) parts.push(`    ${c.snippet}`);
      }
    }

    if (lh.redirectChain && lh.redirectChain.length > 1) {
      parts.push('', `Redirect chain (${lh.redirectChain.length} hops — point links/canonical at the final URL to drop the round-trips):`);
      parts.push(`  ${lh.redirectChain.join(' → ')}`);
    }

    parts.push('');
  }

  if (audits.bundle) {
    const b = audits.bundle;
    const measured = b.source === 'next-manifest' || b.source === 'dist-scan';
    parts.push('## Bundle');
    if (measured) {
      parts.push(`- Built JS: ${Math.round(b.totalEstimatedSize / 1024)}KB (measured from ${b.source})`);
    } else {
      parts.push(
        `- Worst-case dependency size: ~${Math.round(b.totalEstimatedSize / 1024)}KB (estimated — no build output found).`,
        '  This is an upper bound from full-package sizes, NOT the shipped bundle. Run a production build for real numbers.',
      );
    }
    const actionableHeavyDeps = b.heavyDeps.filter((d) => !NON_REMOVABLE_DEPS.has(d.name));
    if (actionableHeavyDeps.length) {
      parts.push('- Heavy dependencies (worst-case full-import size — tree-shakeable libs ship less):');
      for (const d of actionableHeavyDeps) parts.push(`  - ${d.name} (~${Math.round(d.estimatedSize / 1024)}KB)`);
    }
    if (b.duplicateDeps.length) {
      parts.push(
        '- Duplicate installed versions (from node_modules — many are build/CLI tooling that never reaches the client bundle; verify before acting):',
      );
      for (const d of b.duplicateDeps) parts.push(`  - ${d.name}: ${d.versions.join(', ')}`);
    }
    if (b.recommendations.length) {
      parts.push('- Suggested substitutions:');
      for (const r of b.recommendations) parts.push(`  - ${r}`);
    }
    parts.push('');
  }

  if (audits.deadcode) {
    const d = audits.deadcode;
    parts.push('## Dead code');
    if (d.unlisted.length) {
      parts.push(
        `- ⚠ Unlisted dependencies (imported but missing from package.json — can crash a clean install): ${d.unlisted.join(', ')}`,
      );
    }
    if (d.unusedDependencies.length) parts.push(`- Unused dependencies: ${d.unusedDependencies.join(', ')}`);
    if (d.unusedExports.length) {
      parts.push(
        '- Exports not imported by any other module (you may be able to drop the `export` keyword — NOT necessarily dead: each may be used inside its own file, via a dynamic import, or by tests; do NOT delete the symbol without checking):',
      );
      for (const e of d.unusedExports.slice(0, 25)) parts.push(`  - ${e.file} → ${e.name}`);
    }
    if (d.unusedFiles.length) {
      parts.push(
        `- Files with no static importer${d.truncatedFiles ? ' (truncated — likely a misconfigured entry point)' : ''} — verify before deleting:`,
      );
      for (const f of d.unusedFiles) parts.push(`  - ${f}`);
    }
    if (d.possiblyUnusedFiles.length) {
      parts.push(
        '- Possibly-unused files — INVESTIGATE, do NOT delete: these match patterns commonly loaded via filesystem globs, string paths, or route conventions (public/ assets, *.md/*.mdx content, service workers, templates) that static analysis cannot see, so Knip flags them as unused even when they are live:',
      );
      for (const f of d.possiblyUnusedFiles) parts.push(`  - ${f}`);
    }
    parts.push(`- Confidence: ${d.confidence}`);
    parts.push('');
  }

  return parts.join('\n');
}

export interface BriefInput {
  audits: AuditResults;
  stack: StackInfo;
  fileContext?: FileContext[];
  /** Deterministic fixes already produced by the tool (listed so the LLM skips them). */
  ruleFixes?: Fix[];
  url?: string;
  localPath?: string;
}

/**
 * Build a self-contained markdown brief the user can hand to any IDE/agent LLM
 * (Claude Code, Cursor, …) — or that the MCP host model receives — so it can
 * apply the contextual code fixes. No external API is involved.
 */
export function buildFixBrief(input: BriefInput): string {
  const { audits, stack } = input;
  const md: string[] = [];

  md.push('# perfpatch — fix brief');
  md.push('');
  md.push('_Generated by perfpatch. Paste this into your IDE agent (Claude Code, Cursor, …) and let it apply the fixes, or use the perfpatch MCP server._');
  md.push('');

  md.push(buildInstructions(stack.framework));
  md.push('');
  md.push('---');
  md.push('');

  md.push('## Stack');
  md.push(
    `- Framework: ${stack.framework}${stack.frameworkVersion ? ` ${stack.frameworkVersion}` : ''}`,
    `- Bundler: ${stack.bundler} · CSS: ${stack.cssApproach} · Images: ${stack.imageLib}`,
    `- ${stack.typescript ? 'TypeScript' : 'JavaScript'} · ${stack.packageManager} · Node ${stack.nodeVersion}`,
  );
  if (input.url) md.push(`- Audited URL: ${input.url}`);
  if (input.localPath) md.push(`- Project: ${input.localPath}`);
  md.push('');

  md.push(renderFindings(audits));

  if (input.ruleFixes && input.ruleFixes.length > 0) {
    md.push('## Suggested commands (review before running — perfpatch does NOT run these)');
    md.push(
      'Mechanical fixes derived from the audit. Dead-code detection can produce false positives, so verify each is safe for this project before running or applying it.',
    );
    for (const f of input.ruleFixes) {
      md.push(`- ${f.title}${f.command ? ` → \`${f.command}\`` : ''}`);
    }
    md.push('');
  }

  if (input.fileContext && input.fileContext.length > 0) {
    md.push('## Relevant file contents (partial)');
    for (const fc of input.fileContext) {
      md.push('', `### ${fc.path}`, '```', fc.content, '```');
    }
    md.push('');
  }

  md.push('---');
  md.push('');
  md.push('When done, re-run `perfpatch` (or the MCP `verify_fix` tool) to confirm the metrics improved.');

  return md.join('\n');
}
