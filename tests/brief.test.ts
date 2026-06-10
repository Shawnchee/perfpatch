import { describe, expect, it } from 'vitest';
import { buildFixBrief, buildInstructions } from '../src/ai/brief.js';
import type { AuditResults, StackInfo } from '../src/types.js';

const stack: StackInfo = {
  framework: 'nextjs',
  frameworkVersion: '14.2.0',
  bundler: 'webpack',
  cssApproach: 'tailwind',
  imageLib: 'next/image',
  typescript: true,
  nodeVersion: '22.0.0',
  packageManager: 'npm',
};

const audits: AuditResults = {
  bundle: {
    source: 'node-modules-estimate',
    totalEstimatedSize: 250_000,
    heavyDeps: [{ name: 'moment', estimatedSize: 232_000 }],
    duplicateDeps: [],
    recommendations: ['Replace moment with date-fns or dayjs (saves ~230KB)'],
  },
};

describe('buildInstructions', () => {
  it('includes the apply-oriented intro and framework knowledge', () => {
    const text = buildInstructions('nextjs');
    expect(text).toContain('frontend performance engineer');
    expect(text).toContain('apply'); // apply-oriented, not JSON-output
    expect(text).toContain('Next.js');
  });

  it('falls back to generic knowledge', () => {
    expect(buildInstructions('generic')).toContain('Generic frontend fix knowledge');
  });
});

describe('buildFixBrief', () => {
  it('renders a self-contained markdown brief with findings', () => {
    const brief = buildFixBrief({ audits, stack, url: 'https://example.com' });
    expect(brief).toContain('# perfpatch — fix brief');
    expect(brief).toContain('## Stack');
    expect(brief).toContain('nextjs');
    expect(brief).toContain('moment');
    expect(brief).toContain('Claude Code'); // handoff guidance
  });

  it('lists rule fixes as suggested commands to review', () => {
    const brief = buildFixBrief({
      audits,
      stack,
      ruleFixes: [
        {
          id: 'remove-unused-deps',
          title: 'Remove 2 unused dependencies',
          category: 'deadcode',
          impact: 'low',
          effort: 'low',
          file_path: null,
          patch: null,
          command: 'npm uninstall a b',
          explanation: 'x',
          metric_affected: 'bundle size',
          estimated_saving: 'y',
        },
      ],
    });
    expect(brief).toContain('Suggested commands');
    expect(brief).toContain('perfpatch does NOT run these');
    expect(brief).toContain('npm uninstall a b');
  });

  it('relabels exports as non-deletable and segregates dynamically-loaded files', () => {
    const brief = buildFixBrief({
      audits: {
        deadcode: {
          unusedFiles: ['src/orphan.ts'],
          possiblyUnusedFiles: ['public/sw.js', 'content/intro.mdx'],
          unusedDependencies: [],
          unusedDevDependencies: [],
          unusedExports: [{ file: 'lib/sub.ts', name: 'isActiveSubscription' }],
          unlisted: [],
          truncatedFiles: false,
          confidence: 'high',
        },
      },
      stack,
    });
    // exports: must NOT imply deletion
    expect(brief).toContain('drop the `export` keyword');
    expect(brief).not.toContain('Unused exports (may still');
    // dynamically-loaded files: investigate, not delete
    expect(brief).toContain('INVESTIGATE, do NOT delete');
    expect(brief).toContain('public/sw.js');
    expect(brief).toContain('content/intro.mdx');
    // genuinely orphaned still listed separately
    expect(brief).toContain('src/orphan.ts');
  });
});
