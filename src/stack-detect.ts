import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Bundler,
  CssApproach,
  Framework,
  ImageLib,
  PackageManager,
  StackInfo,
} from './types.js';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
  engines?: { node?: string };
}

function readPackageJson(dir: string): PackageJson | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

function allDeps(pkg: PackageJson): Record<string, string> {
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

function fileExists(dir: string, ...names: string[]): boolean {
  return names.some((n) => existsSync(join(dir, n)));
}

/** Strip a semver range prefix (^, ~, >=) to a bare version string. */
function cleanVersion(v: string | undefined): string | null {
  if (!v) return null;
  return v.replace(/^[\^~>=<\s]+/, '').trim() || null;
}

function detectFramework(
  dir: string,
  deps: Record<string, string>,
): { framework: Framework; version: string | null } {
  // PRD §11 — check in order.
  if (fileExists(dir, 'next.config.js', 'next.config.ts', 'next.config.mjs')) {
    return { framework: 'nextjs', version: cleanVersion(deps['next']) };
  }
  if (fileExists(dir, 'astro.config.mjs', 'astro.config.ts', 'astro.config.js')) {
    return { framework: 'astro', version: cleanVersion(deps['astro']) };
  }
  const hasRemix = Object.keys(deps).some((d) => d.startsWith('@remix-run'));
  if (fileExists(dir, 'remix.config.js') || (hasRemix && fileExists(dir, 'vite.config.ts', 'vite.config.js'))) {
    return { framework: 'remix', version: cleanVersion(deps['@remix-run/react']) };
  }
  if (fileExists(dir, 'vite.config.ts', 'vite.config.js', 'vite.config.mjs')) {
    return { framework: 'vite', version: cleanVersion(deps['vite']) };
  }
  if (deps['react-scripts']) {
    return { framework: 'create-react-app', version: cleanVersion(deps['react-scripts']) };
  }
  if (fileExists(dir, 'nuxt.config.ts', 'nuxt.config.js')) {
    return { framework: 'nuxt', version: cleanVersion(deps['nuxt']) };
  }
  return { framework: 'generic', version: null };
}

function detectBundler(framework: Framework, deps: Record<string, string>): Bundler {
  if (deps['@rspack/core']) return 'rspack';
  if (framework === 'vite' || framework === 'remix' || deps['vite']) return 'vite';
  if (framework === 'nextjs') {
    // Turbopack is opt-in but increasingly default; we can't be sure from deps alone.
    return 'webpack';
  }
  if (deps['esbuild']) return 'esbuild';
  if (deps['webpack']) return 'webpack';
  return 'unknown';
}

function detectCss(deps: Record<string, string>): CssApproach {
  if (deps['tailwindcss']) return 'tailwind';
  if (deps['styled-components']) return 'styled-components';
  if (deps['@emotion/react'] || deps['@emotion/styled']) return 'emotion';
  return 'unknown';
}

function detectImageLib(framework: Framework, deps: Record<string, string>): ImageLib {
  if (framework === 'nextjs') return 'next/image';
  if (framework === 'astro') return 'astro:assets';
  if (deps['next-cloudinary'] || deps['cloudinary']) return 'cloudinary';
  if (deps['react-imgix'] || deps['imgix-core-js']) return 'imgix';
  return 'unknown';
}

function detectPackageManager(dir: string, pkg: PackageJson): PackageManager {
  const declared = pkg.packageManager?.split('@')[0];
  if (declared === 'pnpm' || declared === 'yarn' || declared === 'bun' || declared === 'npm') {
    return declared;
  }
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock'))) return 'bun';
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * Detect framework, bundler, CSS approach and tooling from a project directory.
 * Returns a `generic` stack when no package.json is present so callers can
 * still operate (PRD §15.5 — generic mode must work).
 */
export function detectStack(projectPath: string, override?: Framework): StackInfo {
  const pkg = readPackageJson(projectPath) ?? {};
  const deps = allDeps(pkg);

  const detected = override
    ? { framework: override, version: cleanVersion(deps[frameworkPackage(override)]) }
    : detectFramework(projectPath, deps);

  const typescript =
    fileExists(projectPath, 'tsconfig.json') || Boolean(deps['typescript']);

  return {
    framework: detected.framework,
    frameworkVersion: detected.version,
    bundler: detectBundler(detected.framework, deps),
    cssApproach: detectCss(deps),
    imageLib: detectImageLib(detected.framework, deps),
    typescript,
    nodeVersion: pkg.engines?.node ?? process.versions.node,
    packageManager: detectPackageManager(projectPath, pkg),
  };
}

/** Map a framework to the npm package whose version identifies it. */
function frameworkPackage(framework: Framework): string {
  switch (framework) {
    case 'nextjs':
      return 'next';
    case 'astro':
      return 'astro';
    case 'remix':
      return '@remix-run/react';
    case 'vite':
      return 'vite';
    case 'create-react-app':
      return 'react-scripts';
    case 'nuxt':
      return 'nuxt';
    default:
      return '';
  }
}

export function hasPackageJson(projectPath: string): boolean {
  return existsSync(join(projectPath, 'package.json'));
}
