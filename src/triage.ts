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
 *   impact = lighthouse weight × (1 - score)   // bigger gap on a heavy audit = more impact
 *
 * Mutates each audit with impact/fixability/priority and returns a new
 * array sorted descending by priority.
 */
export function triage(audits: FailingAudit[]): FailingAudit[] {
  const scored = audits.map((a) => {
    const impact = a.weight * (1 - a.score);
    const fixability = fixabilityFor(a.id);
    const priority = impact * fixability;
    return { ...a, impact, fixability, priority };
  });
  return scored.sort((x, y) => (y.priority ?? 0) - (x.priority ?? 0));
}

/** Top N audits by priority (default 5, PRD §4). */
export function topIssues(audits: FailingAudit[], n = 5): FailingAudit[] {
  return triage(audits).slice(0, n);
}
