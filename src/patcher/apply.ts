import { applyPatch } from 'diff';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { BACKUP_SUFFIX } from '../config.js';
import type { ApplyResult, Fix } from '../types.js';

/** Paths that must never be written, regardless of the patch (PRD §10). */
const FORBIDDEN_PATTERNS = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /\.lock$/,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /bun\.lockb?$/,
];

function isForbidden(relPath: string): boolean {
  return FORBIDDEN_PATTERNS.some((re) => re.test(relPath));
}

/**
 * Resolve a fix's target path against the project root and ensure it stays
 * inside it (no path traversal — PRD §10.2).
 */
export function resolveTargetPath(
  projectPath: string,
  filePath: string,
): { abs: string; rel: string } | { error: string } {
  const root = resolve(projectPath);
  const abs = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return { error: `refuses to write outside project: ${filePath}` };
  }
  if (isForbidden(rel)) {
    return { error: `refuses to write protected path: ${rel}` };
  }
  return { abs, rel };
}

export interface ApplyOptions {
  dryRun?: boolean;
}

/**
 * Apply a unified-diff patch to a file inside the project, safely.
 *
 * - Verifies the path is inside the project and not protected.
 * - Backs up the original to `{file}.perfpatch-backup` before writing.
 * - Refuses to partial-apply: if the patch doesn't apply cleanly, nothing is
 *   written and the result is reported as skipped (PRD §10.6).
 *
 * Returns ApplyResult; never throws for ordinary failure modes.
 */
export function applyUnifiedDiff(
  projectPath: string,
  filePath: string,
  patch: string,
  fixId: string,
  opts: ApplyOptions = {},
): ApplyResult {
  const base: ApplyResult = { fixId, applied: false, filesChanged: [] };

  const resolved = resolveTargetPath(projectPath, filePath);
  if ('error' in resolved) {
    return { ...base, reason: resolved.error };
  }
  const { abs, rel } = resolved;

  if (!existsSync(abs)) {
    return { ...base, reason: `target file does not exist: ${rel}` };
  }

  const original = readFileSync(abs, 'utf8');
  const patched = applyPatch(original, patch);
  if (patched === false) {
    // Could not apply cleanly — skip, do not partial-apply.
    return { ...base, reason: `patch did not apply cleanly to ${rel}` };
  }

  if (opts.dryRun) {
    return { ...base, applied: false, diff: patch, reason: 'dry-run' };
  }

  // Backup then write.
  const backupPath = abs + BACKUP_SUFFIX;
  copyFileSync(abs, backupPath);
  writeFileSync(abs, patched, 'utf8');

  return { fixId, applied: true, filesChanged: [rel], backupPath, diff: patch };
}

/** Apply a generated Fix's patch (no-op for command-only fixes). */
export function applyFix(fix: Fix, projectPath: string, opts: ApplyOptions = {}): ApplyResult {
  if (!fix.patch || !fix.file_path) {
    return {
      fixId: fix.id,
      applied: false,
      filesChanged: [],
      reason: 'fix has no patch/file_path (likely a command fix)',
    };
  }
  return applyUnifiedDiff(projectPath, fix.file_path, fix.patch, fix.id, opts);
}

/** Restore a file from its perfpatch backup (used on regression — PRD §10). */
export function revertFromBackup(absPath: string): boolean {
  const backupPath = absPath + BACKUP_SUFFIX;
  if (!existsSync(backupPath)) return false;
  copyFileSync(backupPath, absPath);
  return true;
}
