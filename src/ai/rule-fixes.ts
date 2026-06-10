import type { AuditResults, Fix, PackageManager, StackInfo } from '../types.js';

/** Build the uninstall command for the detected package manager. */
function uninstallCmd(pm: PackageManager, packages: string[], dev = false): string {
  const list = packages.join(' ');
  switch (pm) {
    case 'pnpm':
      return `pnpm remove ${list}`;
    case 'yarn':
      return `yarn remove ${list}`;
    case 'bun':
      return `bun remove ${list}`;
    default:
      return dev ? `npm uninstall -D ${list}` : `npm uninstall ${list}`;
  }
}

/**
 * Generate deterministic, high-confidence fixes that need NO language model —
 * purely mechanical changes derived from the audit findings.
 *
 * Currently: removing unused dependencies found by Knip. These are safe,
 * reversible, and expressible as a single command. Everything that needs code
 * judgement (dependency swaps with import rewrites, image/LCP edits, config
 * tuning) is left to the LLM brief instead.
 */
export function generateRuleFixes(audits: AuditResults, stack: StackInfo): Fix[] {
  const fixes: Fix[] = [];
  const pm = stack.packageManager;

  const dc = audits.deadcode;
  if (dc) {
    // Dead-FILE detection is unreliable when entry points look misconfigured
    // (truncatedFiles), but unused-DEPENDENCY detection is independent of that —
    // a dep is unused if nothing imports it. Still surface the caveat so anyone
    // running --apply verifies first.
    const lowConfidence = dc.truncatedFiles;
    const caution = lowConfidence
      ? ' Knip flagged an unusually large number of unused files, which can mean a misconfigured entry point — double-check these are truly unused before removing.'
      : '';

    if (dc.unusedDependencies.length > 0) {
      const n = dc.unusedDependencies.length;
      fixes.push({
        id: 'remove-unused-deps',
        title: `Remove ${n} unused ${n === 1 ? 'dependency' : 'dependencies'}`,
        category: 'deadcode',
        impact: dc.unusedDependencies.length >= 5 ? 'medium' : 'low',
        effort: 'low',
        file_path: null,
        patch: null,
        command: uninstallCmd(pm, dc.unusedDependencies),
        explanation: `These packages are installed but never imported: ${dc.unusedDependencies.join(', ')}.${caution}`,
        metric_affected: 'bundle size',
        estimated_saving: 'removes unused install weight',
      });
    }
    if (dc.unusedDevDependencies.length > 0) {
      const n = dc.unusedDevDependencies.length;
      fixes.push({
        id: 'remove-unused-dev-deps',
        title: `Remove ${n} unused ${n === 1 ? 'devDependency' : 'devDependencies'}`,
        category: 'deadcode',
        impact: 'low',
        effort: 'low',
        file_path: null,
        patch: null,
        command: uninstallCmd(pm, dc.unusedDevDependencies, true),
        explanation: `These devDependencies are never used: ${dc.unusedDevDependencies.join(', ')}.${caution}`,
        metric_affected: 'install size',
        estimated_saving: 'faster installs / smaller lockfile',
      });
    }
  }

  return fixes;
}
