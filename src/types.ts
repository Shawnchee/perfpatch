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
  /** Lighthouse weight in the performance category, if applicable. */
  weight: number;
  /** Computed triage fields (filled by triage.ts). */
  impact?: number;
  fixability?: number;
  priority?: number;
}

export interface LighthouseMetrics {
  lcp: number; // ms
  cls: number; // unitless
  inp: number; // ms
  fcp: number; // ms
  tbt: number; // ms
  tti: number; // ms
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
  unusedFiles: string[];
  unusedDependencies: string[];
  unusedDevDependencies: string[];
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
