import { defineConfig } from 'vitest/config';

// E2E tests run in Node environment (not Miniflare) because the MCP SDK
// pulls in CJS-only dependencies (ajv) that are incompatible with the
// Cloudflare Workers runtime shim. The actual worker is tested via HTTP
// in the deployed environment (see CLAUDE.md Phase 5).
export default defineConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    environment: 'node',
  },
});
