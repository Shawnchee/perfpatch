import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Knip and Lighthouse runs can be slow; give integration-ish tests room.
    testTimeout: 30_000,
  },
});
