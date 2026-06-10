import { describe, expect, it } from 'vitest';
import { generateRuleFixes } from '../src/ai/rule-fixes.js';
import type { AuditResults, StackInfo } from '../src/types.js';

function stack(pm: StackInfo['packageManager']): StackInfo {
  return {
    framework: 'nextjs',
    frameworkVersion: '14.2.0',
    bundler: 'webpack',
    cssApproach: 'tailwind',
    imageLib: 'next/image',
    typescript: true,
    nodeVersion: '22.0.0',
    packageManager: pm,
  };
}

function deadcode(over: Partial<AuditResults['deadcode']> = {}): AuditResults {
  return {
    deadcode: {
      unusedFiles: [],
      possiblyUnusedFiles: [],
      unusedDependencies: [],
      unusedDevDependencies: [],
      unusedExports: [],
      unlisted: [],
      truncatedFiles: false,
      confidence: 'high',
      ...over,
    },
  } as AuditResults;
}

describe('generateRuleFixes', () => {
  it('produces an npm uninstall command for unused deps', () => {
    const fixes = generateRuleFixes(deadcode({ unusedDependencies: ['moment', 'left-pad'] }), stack('npm'));
    const fix = fixes.find((f) => f.id === 'remove-unused-deps');
    expect(fix).toBeDefined();
    expect(fix!.command).toBe('npm uninstall moment left-pad');
    expect(fix!.file_path).toBeNull();
  });

  it('uses the right command for pnpm / yarn / bun', () => {
    expect(
      generateRuleFixes(deadcode({ unusedDependencies: ['x'] }), stack('pnpm'))[0]!.command,
    ).toBe('pnpm remove x');
    expect(
      generateRuleFixes(deadcode({ unusedDependencies: ['x'] }), stack('yarn'))[0]!.command,
    ).toBe('yarn remove x');
    expect(
      generateRuleFixes(deadcode({ unusedDependencies: ['x'] }), stack('bun'))[0]!.command,
    ).toBe('bun remove x');
  });

  it('handles devDependencies with the -D flag (npm)', () => {
    const fixes = generateRuleFixes(deadcode({ unusedDevDependencies: ['eslint-x'] }), stack('npm'));
    const fix = fixes.find((f) => f.id === 'remove-unused-dev-deps');
    expect(fix!.command).toBe('npm uninstall -D eslint-x');
  });

  it('produces no fixes when findings are clean', () => {
    expect(generateRuleFixes(deadcode(), stack('npm'))).toHaveLength(0);
  });

  it('still removes unused deps when files were truncated, but adds a caution', () => {
    // Truncated FILE detection (misconfigured entry point) does not make unused
    // DEP detection unreliable — a dep is unused if nothing imports it.
    const fixes = generateRuleFixes(
      deadcode({ unusedDependencies: ['x'], truncatedFiles: true, confidence: 'low' }),
      stack('npm'),
    );
    const fix = fixes.find((f) => f.id === 'remove-unused-deps');
    expect(fix).toBeDefined();
    expect(fix!.command).toBe('npm uninstall x');
    expect(fix!.explanation).toContain('double-check');
  });
});
