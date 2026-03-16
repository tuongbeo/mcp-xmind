import { defineConfig } from 'vitest/config';

// Standard Vitest config for unit + integration tests (no CF Workers pool needed)
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
    exclude: ['test/e2e/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
    },
  },
  resolve: {
    // Allow importing .js extensions that map to .ts source files
    conditions: ['import', 'module', 'browser', 'default'],
  },
});
