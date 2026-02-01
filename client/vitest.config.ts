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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/types.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 90
      }
    }
  }
});
