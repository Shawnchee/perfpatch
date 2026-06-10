import { describe, expect, it } from 'vitest';
import { THROTTLING_PRESETS } from '../src/auditors/lighthouse.js';

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
