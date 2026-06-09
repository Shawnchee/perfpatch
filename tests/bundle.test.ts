import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { KNOWN_SUBSTITUTIONS, scanBundle } from '../src/auditors/bundle.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('scanBundle', () => {
  it('flags heavy deps and recommends substitutions for a Next.js fixture', () => {
    const result = scanBundle(join(fixtures, 'nextjs-app'));
    expect(result.source).toBe('node-modules-estimate');
    const heavyNames = result.heavyDeps.map((d) => d.name);
    expect(heavyNames).toContain('moment');
    expect(result.recommendations.some((r) => r.includes('moment'))).toBe(true);
    expect(result.recommendations.some((r) => r.includes('axios'))).toBe(true);
  });

  it('sorts heavy deps by estimated size descending', () => {
    const result = scanBundle(join(fixtures, 'nextjs-app'));
    for (let i = 1; i < result.heavyDeps.length; i++) {
      expect(result.heavyDeps[i - 1]!.estimatedSize).toBeGreaterThanOrEqual(
        result.heavyDeps[i]!.estimatedSize,
      );
    }
  });

  it('has a known substitution table covering common offenders', () => {
    expect(KNOWN_SUBSTITUTIONS['moment']).toBeDefined();
    expect(KNOWN_SUBSTITUTIONS['lodash']).toBeDefined();
    expect(KNOWN_SUBSTITUTIONS['react-icons']).toBeDefined();
  });
});
