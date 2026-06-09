import type { Effort, Fix, Impact } from '../types.js';

const IMPACTS: Impact[] = ['high', 'medium', 'low'];
const EFFORTS: Effort[] = ['low', 'medium', 'high'];
const CATEGORIES = ['performance', 'bundle', 'deadcode'] as const;

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function asStringOrNull(v: unknown): string | null {
  return isString(v) && v.trim() !== '' ? v : null;
}

/**
 * Validate one raw object into a Fix. Returns null if it fails the schema or
 * the "must be actionable" rule (PRD §15.10): a fix with neither file_path+patch
 * nor command is discarded.
 */
export function validateFix(raw: unknown): Fix | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (!isString(r['id']) || !isString(r['title'])) return null;
  if (!CATEGORIES.includes(r['category'] as (typeof CATEGORIES)[number])) return null;
  if (!IMPACTS.includes(r['impact'] as Impact)) return null;
  if (!EFFORTS.includes(r['effort'] as Effort)) return null;
  if (!isString(r['explanation'])) return null;

  const patch = asStringOrNull(r['patch']);
  const command = asStringOrNull(r['command']);
  const filePath = asStringOrNull(r['file_path']);

  // Must be actionable: either a patch (which needs a file) or a command.
  const hasPatch = patch !== null && filePath !== null;
  if (!hasPatch && command === null) return null;

  return {
    id: r['id'],
    title: r['title'],
    category: r['category'] as Fix['category'],
    impact: r['impact'] as Impact,
    effort: r['effort'] as Effort,
    file_path: filePath,
    patch,
    command,
    explanation: r['explanation'],
    metric_affected: isString(r['metric_affected']) ? r['metric_affected'] : 'unknown',
    estimated_saving: isString(r['estimated_saving']) ? r['estimated_saving'] : 'unknown',
  };
}

/** Validate and keep only well-formed, actionable fixes from a raw list. */
export function validateFixes(raw: unknown[]): Fix[] {
  return raw.map(validateFix).filter((f): f is Fix => f !== null);
}

const IMPACT_RANK: Record<Impact, number> = { high: 3, medium: 2, low: 1 };
const EFFORT_RANK: Record<Effort, number> = { low: 3, medium: 2, high: 1 };

/** Sort by impact × effort-inverse so high-impact/low-effort comes first (PRD §9). */
export function rankFixes(fixes: Fix[]): Fix[] {
  return [...fixes].sort(
    (a, b) =>
      IMPACT_RANK[b.impact] * EFFORT_RANK[b.effort] -
      IMPACT_RANK[a.impact] * EFFORT_RANK[a.effort],
  );
}
