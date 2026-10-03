import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    // Full-game tests take a few seconds each; under parallel load the 5s default is too tight.
    testTimeout: 20_000,
  },
});
