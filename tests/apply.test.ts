import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyFix, resolveTargetPath, revertFromBackup } from '../src/patcher/apply.js';
import { makeUnifiedDiff } from '../src/patcher/diff.js';
import type { Fix } from '../src/types.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'perfpatch-test-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fix(overrides: Partial<Fix>): Fix {
  return {
    id: 'f1',
    title: 't',
    category: 'performance',
    impact: 'high',
    effort: 'low',
    file_path: 'a.txt',
    patch: null,
    command: null,
    explanation: 'e',
    metric_affected: 'LCP',
    estimated_saving: '~1s',
    ...overrides,
  };
}

describe('resolveTargetPath', () => {
  it('rejects path traversal outside the project', () => {
    const r = resolveTargetPath(dir, '../../etc/passwd');
    expect('error' in r).toBe(true);
  });

  it('rejects node_modules and lockfiles', () => {
    expect('error' in resolveTargetPath(dir, 'node_modules/x/index.js')).toBe(true);
    expect('error' in resolveTargetPath(dir, 'package-lock.json')).toBe(true);
    expect('error' in resolveTargetPath(dir, '.git/config')).toBe(true);
  });

  it('accepts a normal in-project path', () => {
    const r = resolveTargetPath(dir, 'src/page.tsx');
    expect('rel' in r).toBe(true);
  });
});

describe('applyFix', () => {
  it('applies a clean patch and creates a backup', () => {
    const file = join(dir, 'a.txt');
    const before = 'line1\nline2\nline3\n';
    writeFileSync(file, before);
    const after = 'line1\nCHANGED\nline3\n';
    const patch = makeUnifiedDiff('a.txt', before, after);

    const result = applyFix(fix({ patch }), dir);
    expect(result.applied).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(after);
    expect(existsSync(file + '.perfpatch-backup')).toBe(true);
  });

  it('does not write on dry-run', () => {
    const file = join(dir, 'a.txt');
    const before = 'x\n';
    writeFileSync(file, before);
    const patch = makeUnifiedDiff('a.txt', before, 'y\n');
    const result = applyFix(fix({ patch }), dir, { dryRun: true });
    expect(result.applied).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('skips (does not partial-apply) when the patch does not apply cleanly', () => {
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'completely different content\n');
    const patch = makeUnifiedDiff('a.txt', 'original\nlines\nhere\n', 'changed\nlines\nhere\n');
    const result = applyFix(fix({ patch }), dir);
    expect(result.applied).toBe(false);
    expect(result.reason).toMatch(/cleanly/);
  });

  it('skips command-only fixes', () => {
    const result = applyFix(fix({ patch: null, command: 'npm i x' }), dir);
    expect(result.applied).toBe(false);
  });
});

describe('revertFromBackup', () => {
  it('restores the original file', () => {
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'original\n');
    writeFileSync(file + '.perfpatch-backup', 'original\n');
    writeFileSync(file, 'broken\n');
    expect(revertFromBackup(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('original\n');
  });
});
