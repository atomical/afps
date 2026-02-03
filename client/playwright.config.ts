import { defineConfig } from '@playwright/test';

const useWebServer = process.env.PW_NO_WEB_SERVER !== '1';
const baseURL = process.env.PW_BASE_URL ?? 'http://127.0.0.1:5173';
const parsedBaseURL = new URL(baseURL);
const webServerPort = process.env.PW_WEB_SERVER_PORT ?? (parsedBaseURL.port || '5173');

export default defineConfig({
  testDir: './tests/ui',
  testMatch: ['**/*.spec.ts'],
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 }
  },
  webServer: useWebServer
    ? {
        command: `npm run dev -- --host 127.0.0.1 --port ${webServerPort}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000
      }
    : undefined
});
