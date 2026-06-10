import { describe, expect, it } from 'vitest';
import { shapeResult, THROTTLING_PRESETS } from '../src/auditors/lighthouse.js';

describe('THROTTLING_PRESETS', () => {
  it('uses Lantern desktopDense4G values for desktop (1x CPU, 10 Mbps, 40ms RTT)', () => {
    expect(THROTTLING_PRESETS.desktop).toEqual({
      rttMs: 40,
      throughputKbps: 10 * 1024,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    });
  });

  it('uses Lantern mobileSlow4G values for mobile (4x CPU handicap)', () => {
    expect(THROTTLING_PRESETS.mobile).toEqual({
      rttMs: 150,
      throughputKbps: 1.6 * 1024,
      requestLatencyMs: 150 * 3.75,
      downloadThroughputKbps: 1.6 * 1024 * 0.9,
      uploadThroughputKbps: 750 * 0.9,
      cpuSlowdownMultiplier: 4,
    });
  });
});

describe('shapeResult', () => {
  const baseLhr = {
    categories: {
      performance: {
        score: 0.6,
        auditRefs: [
          { id: 'largest-contentful-paint', weight: 25 },
          { id: 'unused-javascript', weight: 0 },
        ],
      },
      accessibility: { score: 0.8, auditRefs: [{ id: 'image-alt', weight: 10 }] },
      seo: { score: 1, auditRefs: [] },
      'best-practices': { score: 1, auditRefs: [] },
    },
    audits: {
      'largest-contentful-paint': { score: 0.3, scoreDisplayMode: 'numeric', numericValue: 4200 },
      'first-contentful-paint': { score: 0.5, scoreDisplayMode: 'numeric', numericValue: 1800 },
      'cumulative-layout-shift': { score: 1, scoreDisplayMode: 'numeric', numericValue: 0.01 },
      'total-blocking-time': { score: 0.9, scoreDisplayMode: 'numeric', numericValue: 150 },
      interactive: { score: 0.7, scoreDisplayMode: 'numeric', numericValue: 5000 },
      'unused-javascript': {
        title: 'Reduce unused JavaScript',
        score: 0.4,
        scoreDisplayMode: 'metricSavings',
        metricSavings: { LCP: 300, FCP: 150 },
        details: { overallSavingsMs: 450, overallSavingsBytes: 120_000 },
      },
      'image-alt': { title: 'Image alt', score: 0, scoreDisplayMode: 'binary' },
      'render-blocking-resources': {
        title: 'Render-blocking',
        score: 0.5,
        scoreDisplayMode: 'metricSavings',
        metricSavings: { FCP: 200 },
      },
      'render-blocking-insight': {
        title: 'Render-blocking insight twin',
        score: 0.5,
        scoreDisplayMode: 'metricSavings',
        metricSavings: { FCP: 200 },
      },
      'cache-insight': {
        title: 'Cache insight without classic twin failing',
        score: 0.5,
        scoreDisplayMode: 'metricSavings',
        metricSavings: { LCP: 0 },
      },
      'an-informative-audit': { score: 0.2, scoreDisplayMode: 'informative' },
    },
  };

  const result = shapeResult('https://example.com', 'desktop', baseLhr);
  const ids = result.failingAudits.map((a) => a.id);

  it('reports INP as null — lab Lighthouse cannot measure it', () => {
    expect(result.metrics.inp).toBeNull();
    expect(result.metrics.lcp).toBe(4200);
    expect(result.metrics.tti).toBe(5000);
  });

  it('excludes metric audits from failingAudits (already surfaced as metrics)', () => {
    expect(ids).not.toContain('largest-contentful-paint');
    expect(ids).not.toContain('first-contentful-paint');
  });

  it("extracts Lighthouse's own savings estimates", () => {
    const uj = result.failingAudits.find((a) => a.id === 'unused-javascript')!;
    expect(uj.savingsMs).toBe(450);
    expect(uj.savingsBytes).toBe(120_000);
    // No overallSavings → falls back to the largest per-metric saving.
    const rb = result.failingAudits.find((a) => a.id === 'render-blocking-resources')!;
    expect(rb.savingsMs).toBe(200);
  });

  it('drops an insight audit when its classic twin is also failing', () => {
    expect(ids).toContain('render-blocking-resources');
    expect(ids).not.toContain('render-blocking-insight');
  });

  it('keeps an insight audit when no classic twin is failing', () => {
    expect(ids).toContain('cache-insight');
  });

  it('assigns weights from non-performance categories too', () => {
    const alt = result.failingAudits.find((a) => a.id === 'image-alt')!;
    expect(alt.weight).toBe(10);
  });

  it('skips informative audits', () => {
    expect(ids).not.toContain('an-informative-audit');
  });
});
