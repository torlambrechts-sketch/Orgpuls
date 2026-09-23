import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Unit tests. Q5 in docs/CODE_REVIEW_2026-09-23.md.
 *
 * `server-only` throws by design when imported outside a React Server Component build,
 * which is every test. It is aliased to an empty module here so server code can be tested
 * at all; the guard it provides is a build-time one, and the build still enforces it.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
