import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// Workers pool config for E2E tests — requires wrangler.toml with valid KV/R2 IDs
// Run with: npx vitest run --config vitest.e2e.config.ts
export default defineWorkersConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    poolOptions: {
      workers: {
        main: './src/index.ts',
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          kvNamespaces: ['XMIND_META'],
          r2Buckets: ['XMIND_FILES'],
          bindings: {
            MCP_AUTH_TOKEN: '',
            MAX_FILE_SIZE_MB: '10',
          },
        },
      },
    },
  },
});
