import { describe, expect, it } from 'vitest';
import { isDynamicallyLoadedFile } from '../src/auditors/deadcode.js';

describe('isDynamicallyLoadedFile', () => {
  it('flags public/ assets, content, service workers, templates', () => {
    for (const p of [
      'public/sw.js',
      'public/robots.txt',
      'content/concepts/intro.mdx',
      'docs/guide.md',
      'src/service-worker.ts',
      'src/sw.ts',
      'src/email-templates/welcome.tsx',
    ]) {
      expect(isDynamicallyLoadedFile(p), p).toBe(true);
    }
  });

  it('does NOT flag ordinary source files', () => {
    for (const p of ['src/components/Button.tsx', 'lib/utils.ts', 'app/page.tsx']) {
      expect(isDynamicallyLoadedFile(p), p).toBe(false);
    }
  });
});
