import { describe, expect, it } from 'vitest';
import { fixabilityFor, topIssues, triage } from '../src/triage.js';
import type { FailingAudit } from '../src/types.js';

function audit(id: string, score: number, weight: number): FailingAudit {
  return { id, title: id, description: '', score, weight };
}

describe('fixabilityFor', () => {
  it('scores image audits high', () => {
    expect(fixabilityFor('uses-optimized-images')).toBe(9);
    expect(fixabilityFor('prioritize-lcp-image')).toBe(9);
  });

  it('scores main-thread work low', () => {
    expect(fixabilityFor('mainthread-work-breakdown')).toBe(3);
  });

  it('defaults unknown audits to 5', () => {
    expect(fixabilityFor('some-unknown-audit')).toBe(5);
  });
});

describe('triage', () => {
  it('sorts by impact × fixability descending', () => {
    const audits = [
      // low weight, low fixability
      audit('mainthread-work-breakdown', 0.5, 0.1),
      // high weight gap, high fixability image
      audit('uses-optimized-images', 0.2, 0.3),
      // medium
      audit('render-blocking-resources', 0.4, 0.2),
    ];
    const sorted = triage(audits);
    expect(sorted[0]!.id).toBe('uses-optimized-images');
    expect(sorted[0]!.priority).toBeGreaterThan(sorted[1]!.priority!);
  });

  it('computes impact as weight × (1 - score)', () => {
    const [scored] = triage([audit('unused-javascript', 0.5, 0.4)]);
    expect(scored!.impact).toBeCloseTo(0.2, 5);
    expect(scored!.fixability).toBe(8);
    expect(scored!.priority).toBeCloseTo(1.6, 5);
  });
});

describe('topIssues', () => {
  it('returns at most N', () => {
    const audits = Array.from({ length: 10 }, (_, i) => audit(`a${i}`, 0.5, 0.1));
    expect(topIssues(audits, 5)).toHaveLength(5);
  });
});
