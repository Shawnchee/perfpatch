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

  it('gives weight-0 opportunities a non-zero priority (real LHR shape)', () => {
    // In real Lighthouse reports every opportunity has weight 0 — priority
    // must still differentiate them, not collapse to 0 × fixability = 0.
    const [scored] = triage([audit('unused-javascript', 0.5, 0)]);
    expect(scored!.priority).toBeGreaterThan(0);
    expect(scored!.fixability).toBe(8);
  });

  it("ranks audits with measured savings above equal audits without (Lighthouse's own estimates)", () => {
    const noSavings = audit('unused-css-rules', 0.5, 0);
    const withSavings = { ...audit('unused-javascript', 0.5, 0), savingsMs: 1200, savingsBytes: 150_000 };
    const sorted = triage([noSavings, withSavings]);
    expect(sorted[0]!.id).toBe('unused-javascript');
    expect(sorted[0]!.priority).toBeGreaterThan(sorted[1]!.priority! * 2);
  });

  it('uses category weight for a11y/seo audits', () => {
    const heavy = audit('image-alt', 0, 10);
    const light = audit('image-alt', 0, 0);
    const [h] = triage([heavy]);
    const [l] = triage([light]);
    expect(h!.impact).toBeGreaterThan(l!.impact!);
  });

  it('breaks ties deterministically (savings, then id)', () => {
    const a = audit('some-unknown-audit-b', 0.5, 0);
    const b = audit('some-unknown-audit-a', 0.5, 0);
    const sorted = triage([a, b]);
    expect(sorted.map((s) => s.id)).toEqual(['some-unknown-audit-a', 'some-unknown-audit-b']);
  });
});

describe('topIssues', () => {
  it('returns at most N', () => {
    const audits = Array.from({ length: 10 }, (_, i) => audit(`a${i}`, 0.5, 0.1));
    expect(topIssues(audits, 5)).toHaveLength(5);
  });
});
