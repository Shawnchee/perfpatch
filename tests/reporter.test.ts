import { describe, expect, it } from 'vitest';
import { render } from '../src/reporter.js';
import type { ReportInput } from '../src/reporter.js';
import type { Fix, StackInfo } from '../src/types.js';

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

const fixes: Fix[] = [
  {
    id: 'swap-moment',
    title: 'Replace moment with dayjs',
    category: 'bundle',
    impact: 'high',
    effort: 'low',
    file_path: null,
    patch: null,
    command: 'npm uninstall moment && npm install dayjs',
    explanation: 'moment is large.',
    metric_affected: 'bundle size',
    estimated_saving: '~230KB',
  },
];

const input: ReportInput = {
  stack,
  audits: {
    lighthouse: {
      url: 'https://example.com',
      device: 'desktop',
      scores: { performance: 61, accessibility: 96, seo: 100, bestPractices: 92 },
      metrics: { lcp: 4200, cls: 0.02, inp: 200, fcp: 1800, tbt: 300, tti: 5000 },
      failingAudits: [],
      rawJson: {},
    },
  },
  fixes,
  url: 'https://example.com',
};

describe('render', () => {
  it('terminal output includes scores and the fix title', () => {
    const out = render('terminal', input);
    expect(out).toContain('perfpatch');
    expect(out).toContain('Replace moment with dayjs');
    expect(out).toContain('HIGH IMPACT');
  });

  it('json output is valid JSON with fixes', () => {
    const out = render('json', input);
    const parsed = JSON.parse(out);
    expect(parsed.fixes).toHaveLength(1);
    expect(parsed.stack.framework).toBe('nextjs');
  });

  it('markdown output has a fixes section', () => {
    const out = render('markdown', input);
    expect(out).toContain('# perfpatch report');
    expect(out).toContain('## Fixes');
    expect(out).toContain('Replace moment with dayjs');
  });

  it('handles zero fixes gracefully', () => {
    const out = render('terminal', { ...input, fixes: [] });
    expect(out).toContain('No actionable fixes');
  });
});
