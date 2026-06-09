import * as ChromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { LIGHTHOUSE_TIMEOUT_MS } from '../config.js';
import type {
  FailingAudit,
  LighthouseAuditResult,
  LighthouseMetrics,
} from '../types.js';

export class PerfpatchError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'PerfpatchError';
  }
}

export type LhCategory = 'performance' | 'accessibility' | 'seo' | 'best-practices';

export interface LighthouseOptions {
  categories?: LhCategory[];
  device?: 'desktop' | 'mobile';
  throttling?: boolean;
}

/** Numeric audit value, or 0 when missing. */
function numericValue(lhr: LhrLike, auditId: string): number {
  return lhr.audits?.[auditId]?.numericValue ?? 0;
}

function score100(lhr: LhrLike, category: string): number {
  const raw = lhr.categories?.[category]?.score;
  return raw == null ? 0 : Math.round(raw * 100);
}

interface LhrAudit {
  id?: string;
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  numericValue?: number;
}

interface LhrCategoryRef {
  id: string;
  weight: number;
}

interface LhrLike {
  audits?: Record<string, LhrAudit>;
  categories?: Record<
    string,
    { score?: number | null; auditRefs?: LhrCategoryRef[] }
  >;
  runtimeError?: { code?: string; message?: string };
}

/**
 * Verify a URL is reachable before spinning up Chrome, so we can give a
 * precise error (PRD §13) instead of a cryptic Lighthouse failure.
 */
async function preflight(url: string): Promise<void> {
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(url);
  const timeoutMs = isLocalhost ? 5_000 : 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (res.status === 403 || res.status === 401) {
      throw new PerfpatchError(
        `${url} returned ${res.status} (authenticated/forbidden).`,
        "perfpatch can't audit authenticated pages in v1. Try --local for codebase analysis.",
      );
    }
    if (res.status >= 400) {
      throw new PerfpatchError(
        `${url} returned HTTP ${res.status}.`,
        'Check the URL is correct and publicly reachable.',
      );
    }
  } catch (err) {
    if (err instanceof PerfpatchError) throw err;
    if (isLocalhost) {
      throw new PerfpatchError(
        `Could not connect to ${url}.`,
        'Is your dev server running?',
      );
    }
    throw new PerfpatchError(
      `Could not reach ${url}: ${(err as Error).message}`,
      'Check your network connection and that the URL is publicly reachable.',
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run a Lighthouse audit against a URL using a locally launched headless
 * Chrome. No Google API involved.
 */
export async function runLighthouse(
  url: string,
  opts: LighthouseOptions = {},
): Promise<LighthouseAuditResult> {
  const device = opts.device ?? 'desktop';
  const categories = opts.categories ?? ['performance', 'accessibility', 'seo', 'best-practices'];

  await preflight(url);

  let chrome: ChromeLauncher.LaunchedChrome;
  try {
    chrome = await ChromeLauncher.launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
    });
  } catch {
    throw new PerfpatchError(
      'Could not launch Chrome.',
      [
        'perfpatch needs Chrome or Chromium installed.',
        '  macOS:   brew install --cask google-chrome',
        '  Linux:   sudo apt install chromium-browser  (or your distro equivalent)',
        '  Windows: download from https://www.google.com/chrome/',
      ].join('\n'),
    );
  }

  try {
    const throttling = opts.throttling ?? true;
    const flags = {
      port: chrome.port,
      output: 'json' as const,
      logLevel: 'error' as const,
      maxWaitForLoad: LIGHTHOUSE_TIMEOUT_MS,
      onlyCategories: categories,
      formFactor: device,
      screenEmulation:
        device === 'desktop'
          ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
          : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
      throttlingMethod: throttling ? ('simulate' as const) : ('provided' as const),
    };

    const result = await lighthouse(url, flags);
    if (!result) {
      throw new PerfpatchError('Lighthouse returned no result.');
    }
    const lhr = result.lhr as unknown as LhrLike;

    if (lhr.runtimeError && lhr.runtimeError.code !== 'NO_ERROR') {
      throw new PerfpatchError(
        `Lighthouse runtime error: ${lhr.runtimeError.message ?? lhr.runtimeError.code}`,
        'The site may use a CSP that blocks headless Chrome; results would be incomplete.',
      );
    }

    return shapeResult(url, device, lhr);
  } finally {
    try {
      chrome.kill();
    } catch {
      /* chrome already gone — ignore */
    }
  }
}

function shapeResult(
  url: string,
  device: 'desktop' | 'mobile',
  lhr: LhrLike,
): LighthouseAuditResult {
  const metrics: LighthouseMetrics = {
    lcp: numericValue(lhr, 'largest-contentful-paint'),
    cls: numericValue(lhr, 'cumulative-layout-shift'),
    inp: numericValue(lhr, 'interaction-to-next-paint'),
    fcp: numericValue(lhr, 'first-contentful-paint'),
    tbt: numericValue(lhr, 'total-blocking-time'),
    tti: numericValue(lhr, 'interactive'),
  };

  // Build weight lookup from the performance category auditRefs.
  const perfRefs = lhr.categories?.['performance']?.auditRefs ?? [];
  const weights = new Map<string, number>();
  for (const ref of perfRefs) weights.set(ref.id, ref.weight);

  const failingAudits: FailingAudit[] = [];
  for (const [id, audit] of Object.entries(lhr.audits ?? {})) {
    const score = audit.score;
    // Only opportunities/diagnostics with a numeric score < 0.9 (PRD §8).
    if (score == null || audit.scoreDisplayMode === 'informative' || audit.scoreDisplayMode === 'notApplicable') {
      continue;
    }
    if (score >= 0.9) continue;
    failingAudits.push({
      id,
      title: audit.title ?? id,
      description: audit.description ?? '',
      score,
      displayValue: audit.displayValue,
      weight: weights.get(id) ?? 0,
    });
  }

  return {
    url,
    device,
    scores: {
      performance: score100(lhr, 'performance'),
      accessibility: score100(lhr, 'accessibility'),
      seo: score100(lhr, 'seo'),
      bestPractices: score100(lhr, 'best-practices'),
    },
    metrics,
    failingAudits,
    rawJson: lhr,
  };
}
