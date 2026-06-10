import chalk from 'chalk';
import { VERSION } from './config.js';
import { topIssues } from './triage.js';
import type {
  AuditResults,
  FailingAudit,
  Fix,
  Impact,
  OutputFormat,
  StackInfo,
} from './types.js';

const RULE = '━'.repeat(50);

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)}KB`;
}

function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

/**
 * "est. savings ~1.2s / ~85KB" from Lighthouse's own estimates, or ''.
 * Skips the byte figure when displayValue already states it ("Est savings of
 * 1,540 KiB") so the line doesn't say the same thing twice.
 */
function savingsLabel(a: FailingAudit): string {
  const dvHasSavings = a.displayValue != null && /savings/i.test(a.displayValue);
  const parts: string[] = [];
  if (a.savingsMs) parts.push(`~${ms(a.savingsMs)}`);
  if (a.savingsBytes && !dvHasSavings) parts.push(`~${kb(a.savingsBytes)}`);
  return parts.length ? `est. savings ${parts.join(' / ')}` : '';
}

export interface ReportInput {
  stack: StackInfo;
  audits: AuditResults;
  fixes: Fix[];
  url?: string;
  localPath?: string;
  verbose?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Terminal
// ─────────────────────────────────────────────────────────────────────────

export function renderTerminal(input: ReportInput): string {
  const { stack, audits, fixes } = input;
  const out: string[] = [];

  out.push(chalk.bold(`perfpatch v${VERSION}`));
  out.push('');

  if (input.url) out.push(`${chalk.cyan('🔍 Auditing')} ${input.url}`);
  if (input.localPath) out.push(`${chalk.cyan('📁 Project')}  ${input.localPath}`);
  out.push(
    chalk.dim(
      `   Stack: ${stack.framework}${stack.frameworkVersion ? ` ${stack.frameworkVersion}` : ''}` +
        `, ${stack.cssApproach}, ${stack.typescript ? 'TypeScript' : 'JavaScript'}`,
    ),
  );
  out.push('');

  // Audit summary lines.
  if (audits.lighthouse) {
    const s = audits.lighthouse.scores;
    out.push(
      `  ${chalk.green('✓')} Lighthouse   ${scoreColor(s.performance)} perf  ` +
        `${scoreColor(s.accessibility)} a11y  ${scoreColor(s.seo)} seo  ${scoreColor(s.bestPractices)} bp`,
    );
  }
  if (audits.bundle) {
    const b = audits.bundle;
    const measured = b.source === 'next-manifest' || b.source === 'dist-scan';
    const sizeLabel = measured
      ? `${kb(b.totalEstimatedSize)} JS (built)`
      : `~${kb(b.totalEstimatedSize)} worst-case dep size (no build output)`;
    out.push(
      `  ${chalk.green('✓')} Bundle       ${sizeLabel}, ` +
        `${b.heavyDeps.length} heavy dep(s), ${b.duplicateDeps.length} duplicate(s)`,
    );
  }
  if (audits.deadcode) {
    const d = audits.deadcode;
    const total =
      d.unusedFiles.length +
      d.possiblyUnusedFiles.length +
      d.unusedDependencies.length +
      d.unusedExports.length;
    if (total === 0) {
      out.push(`  ${chalk.green('✓')} Dead code    no dead code found`);
    } else {
      const investigate = d.possiblyUnusedFiles.length
        ? `, ${d.possiblyUnusedFiles.length} file(s) to investigate`
        : '';
      out.push(
        `  ${chalk.green('✓')} Dead code    ${d.unusedDependencies.length} unused dep(s), ` +
          `${d.unusedFiles.length}${d.truncatedFiles ? '+' : ''} unused file(s), ` +
          `${d.unusedExports.length} non-imported export(s)${investigate}`,
      );
    }
  }
  // Top Lighthouse issues, prioritized by the report's own data (score gap,
  // category weight, estimated savings) × fixability.
  if (audits.lighthouse && audits.lighthouse.failingAudits.length > 0) {
    const lh = audits.lighthouse;
    out.push('');
    out.push(chalk.bold('  Top Lighthouse issues'));
    for (const a of topIssues(lh.failingAudits, 6)) {
      const extras = [a.displayValue, savingsLabel(a)].filter(Boolean).join(' — ');
      out.push(`  • ${a.title}${extras ? chalk.dim(`  (${extras})`) : ''}`);
    }
    if (lh.lcpElement) {
      out.push(`  • ${chalk.dim('LCP element:')} ${lh.lcpElement.slice(0, 100)}`);
    }
  }
  out.push('');
  out.push(RULE);

  if (fixes.length === 0) {
    out.push('');
    out.push(chalk.yellow('No actionable fixes generated.'));
    out.push(chalk.dim('Run with --verbose to see the raw audit data.'));
    if (input.verbose) out.push(renderRawAudits(audits));
    return out.join('\n');
  }

  // Group fixes by impact.
  const groups: Record<Impact, Fix[]> = { high: [], medium: [], low: [] };
  for (const f of fixes) groups[f.impact].push(f);

  let index = 1;
  index = renderGroup(out, '🔴 HIGH IMPACT  (fix these first)', groups.high, index);
  index = renderGroup(out, '🟡 MEDIUM IMPACT', groups.medium, index);
  renderGroup(out, '⚪ LOW IMPACT', groups.low, index);

  out.push('');
  out.push(RULE);
  out.push(
    chalk.dim(
      'Suggested commands are advisory — review, then run them yourself. ' +
        'perfpatch does not remove dependencies for you.',
    ),
  );

  if (input.verbose) out.push(renderRawAudits(audits));

  return out.join('\n');
}

function renderGroup(out: string[], heading: string, fixes: Fix[], startIndex: number): number {
  if (fixes.length === 0) return startIndex;
  out.push('');
  out.push(chalk.bold(heading));
  out.push('');
  let i = startIndex;
  for (const fix of fixes) {
    const tag = `[${i}]`;
    out.push(`${chalk.bold(tag)} ${fix.title.padEnd(48)} ${chalk.dim(fix.estimated_saving)}`);
    if (fix.file_path) out.push(`    ${chalk.dim('File:')} ${fix.file_path}`);
    if (fix.command) out.push(`    ${chalk.dim('Suggested command (review, then run yourself):')} ${fix.command}`);
    out.push(`    ${chalk.dim(`Effort: ${fix.effort.toUpperCase()} — ${fix.explanation}`)}`);
    out.push('');
    i++;
  }
  return i;
}

function scoreColor(score: number): string {
  const s = String(score).padStart(3);
  if (score >= 90) return chalk.green(s);
  if (score >= 50) return chalk.yellow(s);
  return chalk.red(s);
}

function renderRawAudits(audits: AuditResults): string {
  const lines = ['', chalk.dim('── raw audit data ──')];
  if (audits.lighthouse) {
    lines.push(chalk.dim('Lighthouse metrics:'));
    const m = audits.lighthouse.metrics;
    lines.push(
      chalk.dim(
        `  LCP ${ms(m.lcp)}  FCP ${ms(m.fcp)}  TBT ${ms(m.tbt)}  CLS ${m.cls.toFixed(3)}` +
          (m.tti != null ? `  TTI ${ms(m.tti)}` : ''),
      ),
    );
    lines.push(chalk.dim('Top failing audits:'));
    for (const a of audits.lighthouse.failingAudits.slice(0, 15)) {
      lines.push(chalk.dim(`  - ${a.id} (${(a.score * 100).toFixed(0)}) ${a.displayValue ?? ''}`));
    }
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// JSON
// ─────────────────────────────────────────────────────────────────────────

export function renderJson(input: ReportInput): string {
  // Drop the raw Lighthouse report (LHR) — it's 200KB–1MB+ of mostly-unreadable
  // JSON that would swamp the output and any downstream `jq`. Keep the shaped fields.
  const audits = input.audits.lighthouse
    ? { ...input.audits, lighthouse: { ...input.audits.lighthouse, rawJson: undefined } }
    : input.audits;
  return JSON.stringify(
    {
      version: VERSION,
      url: input.url ?? null,
      localPath: input.localPath ?? null,
      stack: input.stack,
      audits,
      fixes: input.fixes,
    },
    null,
    2,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Markdown
// ─────────────────────────────────────────────────────────────────────────

export function renderMarkdown(input: ReportInput): string {
  const { stack, audits, fixes } = input;
  const md: string[] = [];
  md.push(`# perfpatch report`);
  md.push('');
  if (input.url) md.push(`**URL:** ${input.url}`);
  if (input.localPath) md.push(`**Project:** ${input.localPath}`);
  md.push(`**Stack:** ${stack.framework} ${stack.frameworkVersion ?? ''} · ${stack.cssApproach}`);
  md.push('');

  if (audits.lighthouse) {
    const lh = audits.lighthouse;
    const s = lh.scores;
    md.push('## Lighthouse');
    md.push('');
    md.push('| Performance | Accessibility | SEO | Best Practices |');
    md.push('|---|---|---|---|');
    md.push(`| ${s.performance} | ${s.accessibility} | ${s.seo} | ${s.bestPractices} |`);
    md.push('');
    const m = lh.metrics;
    md.push(
      `**Metrics:** LCP ${ms(m.lcp)} · FCP ${ms(m.fcp)} · TBT ${ms(m.tbt)} · CLS ${m.cls.toFixed(3)}` +
        (m.tti != null ? ` · TTI ${ms(m.tti)}` : ''),
    );
    md.push('');
    if (lh.failingAudits.length > 0) {
      md.push('### Top issues (prioritized by measured impact × fixability)');
      md.push('');
      for (const a of topIssues(lh.failingAudits, 8)) {
        const extras = [a.displayValue, savingsLabel(a)].filter(Boolean).join(' — ');
        md.push(`- **${a.title}** (\`${a.id}\`)${extras ? ` — ${extras}` : ''}`);
      }
      md.push('');
    }
    if (lh.lcpElement) {
      md.push(`**LCP element:** \`${lh.lcpElement}\``);
      md.push('');
    }
  }
  if (audits.bundle) {
    const b = audits.bundle;
    const measured = b.source === 'next-manifest' || b.source === 'dist-scan';
    md.push('## Bundle');
    md.push('');
    md.push(
      measured
        ? `- Built JS: ${kb(b.totalEstimatedSize)} (measured from ${b.source})`
        : `- Worst-case dependency size: ~${kb(b.totalEstimatedSize)} (estimated — no build output found)`,
    );
    for (const d of b.heavyDeps) md.push(`- Heavy: ${d.name} (~${kb(d.estimatedSize)})`);
    for (const d of b.duplicateDeps) md.push(`- Duplicate versions: ${d.name} (${d.versions.join(', ')})`);
    for (const r of b.recommendations) md.push(`- ${r}`);
    md.push('');
  }
  if (audits.deadcode) {
    const d = audits.deadcode;
    md.push('## Dead code');
    md.push('');
    if (d.unlisted.length) {
      md.push(`- ⚠ Unlisted dependencies (imported but not in package.json): ${d.unlisted.join(', ')}`);
    }
    if (d.unusedDependencies.length) md.push(`- Unused dependencies: ${d.unusedDependencies.join(', ')}`);
    if (d.unusedDevDependencies.length) {
      md.push(`- Unused devDependencies: ${d.unusedDevDependencies.join(', ')}`);
    }
    if (d.unusedFiles.length) {
      md.push(`- Files with no static importer (verify before deleting)${d.truncatedFiles ? ' — truncated' : ''}:`);
      for (const f of d.unusedFiles) md.push(`  - \`${f}\``);
    }
    if (d.possiblyUnusedFiles.length) {
      md.push('- Possibly-unused files (commonly loaded dynamically — investigate, do NOT delete):');
      for (const f of d.possiblyUnusedFiles) md.push(`  - \`${f}\``);
    }
    if (d.unusedExports.length) {
      md.push(`- Exports not imported elsewhere (may still be used locally/dynamically): ${d.unusedExports.length}`);
    }
    if (
      !d.unlisted.length &&
      !d.unusedDependencies.length &&
      !d.unusedDevDependencies.length &&
      !d.unusedFiles.length &&
      !d.possiblyUnusedFiles.length &&
      !d.unusedExports.length
    ) {
      md.push('- No dead code found.');
    }
    md.push('');
  }

  md.push('## Fixes');
  md.push('');
  if (fixes.length === 0) {
    md.push('_No actionable fixes generated._');
  } else {
    fixes.forEach((fix, i) => {
      md.push(`### ${i + 1}. ${fix.title}`);
      md.push('');
      md.push(`- **Impact:** ${fix.impact} · **Effort:** ${fix.effort}`);
      md.push(`- **Metric:** ${fix.metric_affected} · **Saving:** ${fix.estimated_saving}`);
      if (fix.file_path) md.push(`- **File:** \`${fix.file_path}\``);
      if (fix.command) md.push(`- **Command:** \`${fix.command}\``);
      md.push('');
      md.push(fix.explanation);
      if (fix.patch) {
        md.push('');
        md.push('```diff');
        md.push(fix.patch.trimEnd());
        md.push('```');
      }
      md.push('');
    });
  }

  return md.join('\n');
}

export function render(format: OutputFormat, input: ReportInput): string {
  switch (format) {
    case 'json':
      return renderJson(input);
    case 'markdown':
      return renderMarkdown(input);
    default:
      return renderTerminal(input);
  }
}
