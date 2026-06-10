/**
 * All shared types for perfpatch.
 */

// ─────────────────────────────────────────────────────────────────────────
// Stack detection
// ─────────────────────────────────────────────────────────────────────────

export type Framework =
  | 'nextjs'
  | 'astro'
  | 'remix'
  | 'vite'
  | 'create-react-app'
  | 'nuxt'
  | 'generic';

export type Bundler =
  | 'webpack'
  | 'vite'
  | 'turbopack'
  | 'rspack'
  | 'esbuild'
  | 'unknown';

export type CssApproach =
  | 'tailwind'
  | 'css-modules'
  | 'styled-components'
  | 'emotion'
  | 'plain-css'
  | 'unknown';

export type ImageLib =
  | 'next/image'
  | 'astro:assets'
  | 'cloudinary'
  | 'imgix'
  | 'plain-img'
  | 'unknown';

export type PackageManager = 'npm' | 'pnpm' | 'bun' | 'yarn';

export interface StackInfo {
  framework: Framework;
  frameworkVersion: string | null;
  bundler: Bundler;
  cssApproach: CssApproach;
  imageLib: ImageLib;
  typescript: boolean;
  nodeVersion: string;
  packageManager: PackageManager;
}

// ─────────────────────────────────────────────────────────────────────────
// Lighthouse auditor
// ─────────────────────────────────────────────────────────────────────────

export interface FailingAudit {
  id: string;
  title: string;
  description: string;
  score: number; // 0-1
  displayValue?: string;
  /** Lighthouse scoring weight in its category (perf opportunities are 0). */
  weight: number;
  /** Lighthouse-estimated time saving in ms (from the report, not a guess). */
  savingsMs?: number;
  /** Lighthouse-estimated transfer saving in bytes (from the report). */
  savingsBytes?: number;
  /** Computed triage fields (filled by triage.ts). */
  impact?: number;
  fixability?: number;
  priority?: number;
}

export interface LighthouseMetrics {
  lcp: number; // ms
  cls: number; // unitless
  /** null — lab Lighthouse cannot measure INP (it needs real user input). */
  inp: number | null;
  fcp: number; // ms
  tbt: number; // ms
  /** ms, or null if the audit is absent in this Lighthouse version. */
  tti: number | null;
}

export interface ContrastIssue {
  /** CSS selector or best-available locator for the failing node. */
  selector: string;
  /** Trimmed HTML snippet of the node, if Lighthouse provided one. */
  snippet?: string;
  /** Human-readable text node label, if Lighthouse provided one. */
  nodeLabel?: string;
}

export interface LighthouseAuditResult {
  url: string;
  device: 'desktop' | 'mobile';
  scores: {
    performance: number;
    accessibility: number;
    seo: number;
    bestPractices: number;
  };
  metrics: LighthouseMetrics;
  failingAudits: FailingAudit[];
  /**
   * Actual element responsible for LCP (selector / snippet / nodeLabel),
   * extracted from audits['largest-contentful-paint-element']. Undefined when
   * the audit passed or Lighthouse did not report an element.
   */
  lcpElement?: string;
  /** Up to ~5 nodes failing the color-contrast audit. */
  contrastIssues?: ContrastIssue[];
  /** Ordered URLs in the redirect chain (length > 1 means redirects exist). */
  redirectChain?: string[];
  rawJson: unknown;
}

// ─────────────────────────────────────────────────────────────────────────
// Bundle auditor
// ─────────────────────────────────────────────────────────────────────────

export interface HeavyDep {
  name: string;
  estimatedSize: number; // bytes
  version?: string;
}

export interface DupDep {
  name: string;
  versions: string[];
}

export interface BundleScanResult {
  /** How the size figures were obtained. */
  source: 'next-manifest' | 'dist-scan' | 'node-modules-estimate';
  totalEstimatedSize: number; // bytes
  heavyDeps: HeavyDep[]; // top 10, desc
  duplicateDeps: DupDep[];
  recommendations: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Dead code auditor
// ─────────────────────────────────────────────────────────────────────────

export interface UnusedExport {
  file: string;
  name: string;
}

export interface DeadCodeResult {
  /**
   * Files with no static importer AND not matching a known dynamic-load pattern.
   * Closer to genuinely orphaned, but still verify before deleting.
   */
  unusedFiles: string[];
  /**
   * Files Knip flagged as unused but that match a dynamic-load pattern (public/
   * assets, *.md/*.mdx content, service workers, templates). These are commonly
   * loaded via filesystem globs, string paths, or route conventions that static
   * analysis cannot see — surface for investigation, NEVER as "delete these".
   */
  possiblyUnusedFiles: string[];
  unusedDependencies: string[];
  unusedDevDependencies: string[];
  /**
   * Exports not imported by any OTHER module. This does NOT mean dead code:
   * the symbol may be used in its own file, via dynamic import, or by tests.
   * The actionable read is "you may be able to drop the `export` keyword".
   */
  unusedExports: UnusedExport[];
  unlisted: string[];
  /** Set when unusedFiles was truncated for display (likely misconfig). */
  truncatedFiles: boolean;
  confidence: 'high' | 'low';
}

// ─────────────────────────────────────────────────────────────────────────
// Combined audit results passed to the AI layer
// ─────────────────────────────────────────────────────────────────────────

export interface AuditResults {
  lighthouse?: LighthouseAuditResult;
  bundle?: BundleScanResult;
  deadcode?: DeadCodeResult;
}

export interface FileContext {
  path: string;
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────
// AI fix generation
// ─────────────────────────────────────────────────────────────────────────

export type FixCategory = 'performance' | 'bundle' | 'deadcode';
export type Impact = 'high' | 'medium' | 'low';
export type Effort = 'low' | 'medium' | 'high';

export interface Fix {
  id: string;
  title: string;
  category: FixCategory;
  impact: Impact;
  effort: Effort;
  file_path: string | null;
  patch: string | null; // unified diff
  command: string | null; // shell command, e.g. dependency swap
  explanation: string;
  metric_affected: string;
  estimated_saving: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Patch application & verification
// ─────────────────────────────────────────────────────────────────────────

export interface ApplyResult {
  fixId: string;
  applied: boolean;
  filesChanged: string[];
  backupPath?: string;
  diff?: string;
  reason?: string; // why it was skipped, if applied === false
}

export type MetricName = keyof LighthouseMetrics | 'performance';

export interface VerifyResult {
  metric: MetricName;
  baseline: number;
  current: number;
  delta: number;
  improved: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// CLI options
// ─────────────────────────────────────────────────────────────────────────

export type Category = 'perf' | 'bundle' | 'deadcode' | 'all';
export type OutputFormat = 'terminal' | 'json' | 'markdown';

export interface CliOptions {
  url?: string;
  local?: string;
  stack?: Framework;
  dryRun: boolean;
  apply: boolean;
  category: Category;
  output: OutputFormat;
  save?: string;
  /** Path to write the LLM fix brief, or false to skip writing it. */
  prompt: string | false;
  budget?: { metric: string; threshold: number };
  mobile: boolean;
  verbose: boolean;
}
