import { runLighthouse } from './auditors/lighthouse.js';
import type { LighthouseMetrics, MetricName, VerifyResult } from './types.js';

/** Metrics where a lower value is better (timings, layout shift). */
const LOWER_IS_BETTER: Set<MetricName> = new Set<MetricName>([
  'lcp',
  'cls',
  'inp',
  'fcp',
  'tbt',
  'tti',
]);

/**
 * Re-run Lighthouse and compare a single metric to a baseline (PRD §10).
 * `performance` compares the 0-100 score (higher is better); all others are
 * raw metric values (lower is better).
 */
export async function verifyFix(
  url: string,
  metric: MetricName,
  baseline: number,
  device: 'desktop' | 'mobile' = 'desktop',
): Promise<VerifyResult> {
  const result = await runLighthouse(url, { categories: ['performance'], device });

  const current =
    metric === 'performance'
      ? result.scores.performance
      : result.metrics[metric as keyof LighthouseMetrics];

  const delta = current - baseline;
  const improved = LOWER_IS_BETTER.has(metric) ? delta < 0 : delta > 0;

  return { metric, baseline, current, delta, improved };
}
