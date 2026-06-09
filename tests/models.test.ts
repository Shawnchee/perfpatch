import { describe, expect, it } from 'vitest';
import { rankFixes, validateFix, validateFixes } from '../src/ai/models.js';
import type { Fix } from '../src/types.js';

const validRaw = {
  id: 'swap-moment',
  title: 'Replace moment with dayjs',
  category: 'bundle',
  impact: 'high',
  effort: 'low',
  file_path: null,
  patch: null,
  command: 'npm uninstall moment && npm install dayjs',
  explanation: 'moment is large and not tree-shakeable.',
  metric_affected: 'bundle size',
  estimated_saving: '~230KB',
};

describe('validateFix', () => {
  it('accepts a command-only fix', () => {
    expect(validateFix(validRaw)).not.toBeNull();
  });

  it('accepts a patch+file_path fix', () => {
    const fix = validateFix({
      ...validRaw,
      command: null,
      file_path: 'src/app/page.tsx',
      patch: '--- a\n+++ b\n@@ -1 +1 @@\n-x\n+y\n',
    });
    expect(fix).not.toBeNull();
  });

  it('rejects a fix with neither command nor patch (PRD §15.10)', () => {
    expect(validateFix({ ...validRaw, command: null, patch: null })).toBeNull();
  });

  it('rejects a patch without a file_path', () => {
    expect(
      validateFix({ ...validRaw, command: null, patch: 'some diff', file_path: null }),
    ).toBeNull();
  });

  it('rejects bad enums and missing fields', () => {
    expect(validateFix({ ...validRaw, impact: 'huge' })).toBeNull();
    expect(validateFix({ ...validRaw, category: 'nonsense' })).toBeNull();
    expect(validateFix({ id: 'x' })).toBeNull();
    expect(validateFix(null)).toBeNull();
  });
});

describe('validateFixes', () => {
  it('keeps valid fixes and drops invalid ones', () => {
    const fixes = validateFixes([validRaw, { id: 'bad' }, null]);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]!.id).toBe('swap-moment');
  });
});

describe('rankFixes', () => {
  it('orders high-impact/low-effort first', () => {
    const fixes: Fix[] = [
      { ...(validateFix(validRaw) as Fix), id: 'a', impact: 'low', effort: 'high' },
      { ...(validateFix(validRaw) as Fix), id: 'b', impact: 'high', effort: 'low' },
    ];
    expect(rankFixes(fixes)[0]!.id).toBe('b');
  });
});
