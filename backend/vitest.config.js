import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    // Integration tests share one database; don't run files in parallel.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
