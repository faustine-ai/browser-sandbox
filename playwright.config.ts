import { defineConfig, devices } from '@playwright/test';

// The browser suite drives the built library inside fixture host pages served
// by test/fixtures/server.ts (strict CSP, no CSP, lax CSP) with /sandbox served
// with the headers of `frameHeaders()`. One project per engine.
export default defineConfig({
  testDir: 'test/browser',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'node test/fixtures/server.mjs',
    url: 'http://127.0.0.1:4173/healthz',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
