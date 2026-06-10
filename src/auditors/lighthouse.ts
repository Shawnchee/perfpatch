import * as ChromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { LIGHTHOUSE_TIMEOUT_MS } from '../config.js';
import type {
  ContrastIssue,
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

/**
 * Lighthouse/Lantern simulated-throttling presets, hardcoded from
 * lighthouse@12.8.2 (Lantern Constants: desktopDense4G / mobileSlow4G).
 * Hardcoded rather than imported: the source lives in a transitive dep
 * (@paulirish/trace_engine internal path) and is not a stable public export.
 * Without these, throttlingMethod:'simulate' silently defaults to mobileSlow4G
 * (4x CPU slowdown), so "desktop" audits ran with a mobile handicap.
 */
export const THROTTLING_PRESETS = {
  // Lantern desktopDense4G
  desktop: {
    rttMs: 40,
    throughputKbps: 10 * 1024,
    cpuSlowdownMultiplier: 1,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
  },
  // Lantern mobileSlow4G (DevTools-adjusted: rtt x3.75, throughput x0.9)
  mobile: {
    rttMs: 150,
    throughputKbps: 1.6 * 1024,
    requestLatencyMs: 150 * 3.75,
    downloadThroughputKbps: 1.6 * 1024 * 0.9,
    uploadThroughputKbps: 750 * 0.9,
    cpuSlowdownMultiplier: 4,
  },
} as const;

/** Numeric audit value, or 0 when missing. */
function numericValue(lhr: LhrLike, auditId: string): number {
  return lhr.audits?.[auditId]?.numericValue ?? 0;
}

function score100(lhr: LhrLike, category: string): number {
  const raw = lhr.categories?.[category]?.score;
  return raw == null ? 0 : Math.round(raw * 100);
}

/** Pick the most descriptive non-empty locator from a node, trimmed/clamped. */
function describeNode(node: LhrNode | undefined): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const candidates = [node.snippet, node.nodeLabel, node.selector];
  for (const raw of candidates) {
    if (typeof raw === 'string') {
      const trimmed = raw.trim().replace(/\s+/g, ' ');
      if (trimmed) return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed;
    }
  }
  return undefined;
}

/**
 * Extract the LCP element locator from
 * audits['largest-contentful-paint-element'].details.items[].items[].node.
 * The LH shape nests a sub-table: items[0].items[0].node. Guarded throughout.
 */
function extractLcpElement(lhr: LhrLike): string | undefined {
  const audit = lhr.audits?.['largest-contentful-paint-element'];
  const items = audit?.details?.items;
  if (!Array.isArray(items)) return undefined;
  for (const row of items) {
    if (!row || typeof row !== 'object') continue;
    const sub = (row as LhrDetailItem).items;
    if (Array.isArray(sub)) {
      for (const inner of sub) {
        const desc = describeNode(inner?.node);
        if (desc) return desc;
      }
    }
    // Some LH versions place the node directly on the row.
    const direct = describeNode((row as LhrDetailItem).node);
    if (direct) return direct;
  }
  return undefined;
}

/**
 * Extract up to `max` failing color-contrast nodes from
 * audits['color-contrast'].details.items[].node. Guarded throughout.
 */
function extractContrastIssues(lhr: LhrLike, max = 5): ContrastIssue[] | undefined {
  const items = lhr.audits?.['color-contrast']?.details?.items;
  if (!Array.isArray(items)) return undefined;
  const out: ContrastIssue[] = [];
  for (const row of items) {
    if (out.length >= max) break;
    const node = (row as LhrDetailItem | undefined)?.node;
    if (!node || typeof node !== 'object') continue;
    const selector =
      (typeof node.selector === 'string' && node.selector.trim()) ||
      (typeof node.path === 'string' && node.path.trim()) ||
      describeNode(node);
    if (!selector) continue;
    const snippet =
      typeof node.snippet === 'string' && node.snippet.trim()
        ? node.snippet.trim()
        : undefined;
    const nodeLabel =
      typeof node.nodeLabel === 'string' && node.nodeLabel.trim()
        ? node.nodeLabel.trim()
        : undefined;
    out.push({ selector, snippet, nodeLabel });
  }
  return out.length ? out : undefined;
}

/**
 * Extract the redirect chain (ordered URLs) from
 * audits['redirects'].details.items[].url. Each url may be a string or an
 * object { url }. Guarded throughout.
 */
function extractRedirectChain(lhr: LhrLike): string[] | undefined {
  const items = lhr.audits?.['redirects']?.details?.items;
  if (!Array.isArray(items)) return undefined;
  const urls: string[] = [];
  for (const row of items) {
    const raw = (row as LhrDetailItem | undefined)?.url;
    let url: string | undefined;
    if (typeof raw === 'string') url = raw.trim();
    else if (raw && typeof raw === 'object' && typeof raw.url === 'string') url = raw.url.trim();
    if (url) urls.push(url);
  }
  // A chain is only meaningful when there is more than one hop.
  return urls.length > 1 ? urls : undefined;
}

/**
 * Loosely-typed node descriptor as it appears in Lighthouse details items.
 * Every field is optional because the shape varies by audit and LH version.
 */
interface LhrNode {
  type?: string;
  selector?: string;
  snippet?: string;
  nodeLabel?: string;
  path?: string;
  boundingRect?: unknown;
}

/** A single row in audits[id].details.items. Shapes vary per audit. */
interface LhrDetailItem {
  // largest-contentful-paint-element nests a sub-table under `items`.
  items?: Array<{ node?: LhrNode }>;
  // color-contrast rows carry the failing node directly.
  node?: LhrNode;
  // redirects rows carry a url (string) and/or a urlProvider.
  url?: string | { url?: string };
  [key: string]: unknown;
}

interface LhrDetails {
  type?: string;
  items?: LhrDetailItem[];
}

interface LhrAudit {
  id?: string;
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  numericValue?: number;
  details?: LhrDetails;
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
      // Match throttling to form factor; otherwise simulate defaults to
      // mobileSlow4G (4x CPU) even for desktop audits.
      throttling: THROTTLING_PRESETS[device],
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
    lcpElement: extractLcpElement(lhr),
    contrastIssues: extractContrastIssues(lhr),
    redirectChain: extractRedirectChain(lhr),
    rawJson: lhr,
  };
}
