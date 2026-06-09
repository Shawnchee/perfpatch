import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectStack, hasPackageJson, unknownStack } from '../src/stack-detect.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('detectStack', () => {
  it('detects Next.js with version, Tailwind, TypeScript', () => {
    const stack = detectStack(join(fixtures, 'nextjs-app'));
    expect(stack.framework).toBe('nextjs');
    expect(stack.frameworkVersion).toBe('14.2.0');
    expect(stack.cssApproach).toBe('tailwind');
    expect(stack.imageLib).toBe('next/image');
    expect(stack.typescript).toBe(true);
    expect(stack.bundler).toBe('webpack');
  });

  it('detects Vite with emotion', () => {
    const stack = detectStack(join(fixtures, 'vite-app'));
    expect(stack.framework).toBe('vite');
    expect(stack.bundler).toBe('vite');
    expect(stack.cssApproach).toBe('emotion');
  });

  it('falls back to generic for a plain node project', () => {
    const stack = detectStack(join(fixtures, 'generic-app'));
    expect(stack.framework).toBe('generic');
    expect(stack.typescript).toBe(false);
  });

  it('honors an explicit framework override', () => {
    const stack = detectStack(join(fixtures, 'generic-app'), 'astro');
    expect(stack.framework).toBe('astro');
  });

  it('returns generic when no package.json exists', () => {
    const stack = detectStack('/nonexistent/path', 'generic');
    expect(stack.framework).toBe('generic');
    expect(stack.nodeVersion).toBeTruthy();
  });
});

describe('unknownStack', () => {
  it('returns an all-unknown stack without reading the filesystem', () => {
    const stack = unknownStack();
    expect(stack.framework).toBe('generic');
    expect(stack.typescript).toBe(false);
    expect(stack.bundler).toBe('unknown');
    expect(stack.cssApproach).toBe('unknown');
  });

  it('honors an explicit framework override', () => {
    expect(unknownStack('nextjs').framework).toBe('nextjs');
  });
});

describe('hasPackageJson', () => {
  it('is true for a fixture app and false otherwise', () => {
    expect(hasPackageJson(join(fixtures, 'nextjs-app'))).toBe(true);
    expect(hasPackageJson('/nonexistent/path')).toBe(false);
  });
});
