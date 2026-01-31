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
      lines: 100,
      functions: 100,
      branches: 100,
      statements: 100,
      include: ['src/**/*.ts']
    }
  }
});
