import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BundleScanResult, DupDep, HeavyDep } from '../types.js';

/**
 * High-value dependency swaps to surface as recommendations (PRD §8).
 * `savings` is an approximate min-gzip figure in bytes.
 */
const KNOWN_SUBSTITUTIONS: Record<
  string,
  { replacement: string; savings: number; note: string }
> = {
  moment: { replacement: 'date-fns or dayjs', savings: 230_000, note: 'moment is large and not tree-shakeable' },
  lodash: { replacement: 'lodash-es or native methods', savings: 70_000, note: 'import per-method or use native equivalents' },
  axios: { replacement: 'native fetch', savings: 40_000, note: 'fetch is built into all supported runtimes' },
  uuid: { replacement: 'crypto.randomUUID()', savings: 8_000, note: 'built into Node 19+ and modern browsers' },
  classnames: { replacement: 'clsx', savings: 2_000, note: 'clsx is a smaller, faster drop-in' },
  'react-icons': { replacement: 'specific icon imports', savings: 500_000, note: 'avoid importing the full icon set' },
};

/**
 * Rough gzipped-size estimates (bytes) for common heavy packages, used when
 * no build output is available. Not exhaustive — a heuristic to flag bloat.
 */
const SIZE_ESTIMATES: Record<string, number> = {
  moment: 232_000,
  lodash: 71_000,
  axios: 44_000,
  'react-icons': 500_000,
  '@mui/material': 350_000,
  'chart.js': 210_000,
  'three': 600_000,
  'firebase': 480_000,
  'aws-sdk': 700_000,
  'rxjs': 180_000,
  'core-js': 150_000,
  'antd': 400_000,
  'react-dom': 130_000,
  'react': 6_500,
  '@reduxjs/toolkit': 60_000,
  'framer-motion': 110_000,
  'styled-components': 50_000,
  'd3': 270_000,
};

interface PackageJson {
  dependencies?: Record<string, string>;
}

function dirSizeOfJs(dir: string, budgetFiles = 5_000): number {
  let total = 0;
  let count = 0;
  const walk = (current: string): void => {
    if (count > budgetFiles) return;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else if (/\.(js|mjs|cjs)$/.test(entry)) {
        total += st.size;
        count++;
      }
    }
  };
  walk(dir);
  return total;
}

/** Strategy 1: Next.js build manifest. */
function scanNextManifest(projectPath: string): BundleScanResult | null {
  const nextDir = join(projectPath, '.next');
  if (!existsSync(nextDir)) return null;

  // Sum sizes of emitted static JS chunks.
  const chunksDir = join(nextDir, 'static');
  const totalEstimatedSize = existsSync(chunksDir) ? dirSizeOfJs(chunksDir) : 0;

  const { heavyDeps, duplicateDeps } = analyzeDeps(projectPath);
  return {
    source: 'next-manifest',
    totalEstimatedSize,
    heavyDeps,
    duplicateDeps,
    recommendations: buildRecommendations(projectPath),
  };
}

/** Strategy 2: dist/ or build/ scan. */
function scanDist(projectPath: string): BundleScanResult | null {
  const candidates = ['dist', 'build', 'out'];
  const found = candidates.map((c) => join(projectPath, c)).find((p) => existsSync(p));
  if (!found) return null;

  const totalEstimatedSize = dirSizeOfJs(found);
  const { heavyDeps, duplicateDeps } = analyzeDeps(projectPath);
  return {
    source: 'dist-scan',
    totalEstimatedSize,
    heavyDeps,
    duplicateDeps,
    recommendations: buildRecommendations(projectPath),
  };
}

/** Strategy 3: estimate from declared dependencies. */
function scanNodeModules(projectPath: string): BundleScanResult {
  const { heavyDeps, duplicateDeps } = analyzeDeps(projectPath);
  const totalEstimatedSize = heavyDeps.reduce((sum, d) => sum + d.estimatedSize, 0);
  return {
    source: 'node-modules-estimate',
    totalEstimatedSize,
    heavyDeps,
    duplicateDeps,
    recommendations: buildRecommendations(projectPath),
  };
}

function readPkg(projectPath: string): PackageJson {
  try {
    return JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf8')) as PackageJson;
  } catch {
    return {};
  }
}

/** Read installed version of a package from node_modules, if present. */
function installedVersion(projectPath: string, name: string): string | undefined {
  try {
    const pkg = JSON.parse(
      readFileSync(join(projectPath, 'node_modules', name, 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version;
  } catch {
    return undefined;
  }
}

function analyzeDeps(projectPath: string): { heavyDeps: HeavyDep[]; duplicateDeps: DupDep[] } {
  const pkg = readPkg(projectPath);
  const deps = Object.keys(pkg.dependencies ?? {});

  const heavyDeps: HeavyDep[] = deps
    .filter((name) => SIZE_ESTIMATES[name] != null)
    .map((name) => ({
      name,
      estimatedSize: SIZE_ESTIMATES[name] ?? 0,
      version: installedVersion(projectPath, name),
    }))
    .sort((a, b) => b.estimatedSize - a.estimatedSize)
    .slice(0, 10);

  return { heavyDeps, duplicateDeps: findDuplicates(projectPath) };
}

/**
 * Detect duplicate package versions by scanning nested node_modules dirs.
 * Best-effort and shallow — full hoisting analysis is out of scope for v1.
 */
function findDuplicates(projectPath: string): DupDep[] {
  const root = join(projectPath, 'node_modules');
  if (!existsSync(root)) return [];
  const versions = new Map<string, Set<string>>();

  const record = (name: string, dir: string): void => {
    const v = installedVersionAt(dir);
    if (!v) return;
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name)!.add(v);
  };

  // Top-level packages.
  let topLevel: string[];
  try {
    topLevel = readdirSync(root);
  } catch {
    return [];
  }
  for (const entry of topLevel) {
    if (entry.startsWith('.')) continue;
    const full = join(root, entry);
    record(entry, full);
    // One level of nested node_modules (common dedupe miss).
    const nested = join(full, 'node_modules');
    if (existsSync(nested)) {
      try {
        for (const sub of readdirSync(nested)) {
          if (sub.startsWith('.')) continue;
          record(sub, join(nested, sub));
        }
      } catch {
        /* ignore */
      }
    }
  }

  const dups: DupDep[] = [];
  for (const [name, vset] of versions) {
    if (vset.size > 1) dups.push({ name, versions: [...vset] });
  }
  return dups.slice(0, 10);
}

function installedVersionAt(dir: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version?: string };
    return pkg.version;
  } catch {
    return undefined;
  }
}

function buildRecommendations(projectPath: string): string[] {
  const pkg = readPkg(projectPath);
  const deps = Object.keys(pkg.dependencies ?? {});
  const recs: string[] = [];
  for (const name of deps) {
    const sub = KNOWN_SUBSTITUTIONS[name];
    if (sub) {
      recs.push(
        `Replace ${name} with ${sub.replacement} (saves ~${Math.round(sub.savings / 1000)}KB — ${sub.note})`,
      );
    }
  }
  return recs;
}

/**
 * Scan a project's bundle, preferring real build output and falling back to
 * dependency estimates (PRD §8).
 */
export function scanBundle(projectPath: string): BundleScanResult {
  return (
    scanNextManifest(projectPath) ??
    scanDist(projectPath) ??
    scanNodeModules(projectPath)
  );
}

export { KNOWN_SUBSTITUTIONS };
