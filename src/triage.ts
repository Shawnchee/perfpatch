import type { FailingAudit } from './types.js';

/**
 * Hardcoded fixability scores (1-10) per Lighthouse audit id (PRD §8).
 * Higher = easier/more mechanical to fix with a code patch.
 * Substring matching is used so related audit ids share a score.
 */
const FIXABILITY: Array<{ match: string; score: number }> = [
  // Images — almost always a mechanical attribute/loader change.
  { match: 'uses-optimized-images', score: 9 },
  { match: 'modern-image-formats', score: 9 },
  { match: 'uses-responsive-images', score: 9 },
  { match: 'offscreen-images', score: 9 },
  { match: 'efficient-animated-content', score: 8 },
  { match: 'prioritize-lcp-image', score: 9 },
  // JS bloat — removable / swappable.
  { match: 'unused-javascript', score: 8 },
  { match: 'legacy-javascript', score: 8 },
  { match: 'duplicated-javascript', score: 7 },
  { match: 'unminified-javascript', score: 7 },
  // Render blocking — defer / preload.
  { match: 'render-blocking-resources', score: 7 },
  { match: 'unminified-css', score: 7 },
  { match: 'unused-css-rules', score: 6 },
  { match: 'critical-request-chains', score: 5 },
  // Fonts.
  { match: 'font-display', score: 6 },
  { match: 'preload-fonts', score: 6 },
  // Network / caching — often config or infra.
  { match: 'uses-text-compression', score: 6 },
  { match: 'uses-long-cache-ttl', score: 5 },
  { match: 'server-response-time', score: 3 },
  { match: 'redirects', score: 4 },
  // Layout shift / main-thread — usually structural, harder.
  { match: 'layout-shift', score: 4 },
  { match: 'cumulative-layout-shift', score: 4 },
  { match: 'mainthread-work', score: 3 },
  { match: 'bootup-time', score: 3 },
  { match: 'dom-size', score: 3 },
  // Lighthouse 12.6+ insight audits without a same-name classic twin
  // (twins like legacy-javascript-insight already match by substring above).
  { match: 'image-delivery', score: 9 },
  { match: 'lcp-discovery', score: 9 },
  { match: 'render-blocking', score: 7 },
  { match: 'document-latency', score: 6 },
  { match: 'modern-http', score: 6 },
  { match: 'cache-insight', score: 5 },
  { match: 'network-dependency', score: 5 },
  { match: 'third-parties', score: 4 },
  { match: 'cls-culprits', score: 4 },
  { match: 'forced-reflow', score: 3 },
];

const DEFAULT_FIXABILITY = 5;

export function fixabilityFor(auditId: string): number {
  for (const { match, score } of FIXABILITY) {
    if (auditId.includes(match)) return score;
  }
  return DEFAULT_FIXABILITY;
}

/**
 * Score and sort failing audits by priority = impact × fixability.
 *
 * Impact is grounded in what the Lighthouse report actually measured:
 *
 *   impact = (1 - score)                  // how badly the audit fails (0..1)
 *          + min(weight, 10) / 10         // category scoring weight (a11y/seo/bp)
 *          + min(savingsMs / 250, 8)      // Lighthouse-estimated time saving
 *          + min(savingsBytes / 50KB, 8)  // Lighthouse-estimated transfer saving
 *
 * Perf opportunities all carry weight 0 in the LHR — their impact comes from
 * the report's own savings estimates, NOT from a guessed ranking. Ties break
 * by savings, then id, so ordering is deterministic.
 *
 * Returns a new array (with impact/fixability/priority filled) sorted
 * descending by priority.
 */
export function triage(audits: FailingAudit[]): FailingAudit[] {
  const scored = audits.map((a) => {
    const gap = 1 - a.score;
    const weightBoost = Math.min(a.weight, 10) / 10;
    const savingsBoost =
      Math.min((a.savingsMs ?? 0) / 250, 8) + Math.min((a.savingsBytes ?? 0) / 50_000, 8);
    const impact = gap + weightBoost + savingsBoost;
    const fixability = fixabilityFor(a.id);
    const priority = impact * fixability;
    return { ...a, impact, fixability, priority };
  });
  return scored.sort(
    (x, y) =>
      (y.priority ?? 0) - (x.priority ?? 0) ||
      (y.savingsMs ?? 0) - (x.savingsMs ?? 0) ||
      x.id.localeCompare(y.id),
  );
}

/** Top N audits by priority (default 5, PRD §4). */
export function topIssues(audits: FailingAudit[], n = 5): FailingAudit[] {
  return triage(audits).slice(0, n);
}
