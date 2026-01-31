import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022'
  },
  server: {
    fs: {
      allow: [resolve(__dirname, '..')]
    }
  }
});
