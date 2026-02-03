import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    fs: {
      allow: [resolve(__dirname, '..')]
    }
  },
  test: {
    environment: 'happy-dom',
    exclude: ['tests/ui/**/*.spec.ts', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      // Keep coverage strict on core gameplay/networking modules, but exclude
      // integration-heavy UI/asset code that is better covered via Playwright.
      exclude: [
        'src/**/types.ts',
        '**/src/main.ts',
        '**/src/ui/prejoin.ts',
        '**/src/players/**',
        'src/net/fbs/**',
        'src/ui/**',
        'src/audio/**',
        'src/environment/**'
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 90
      }
    }
  }
});
