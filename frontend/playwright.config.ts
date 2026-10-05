import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run a real browser against a RUNNING backend (E2E_API_URL, default http://127.0.0.1:3000)
 * and a RUNNING frontend (E2E_BASE_URL, default http://127.0.0.1:3001). Start both first (see README).
 * The backend's AUTH_RATE_LIMIT_MAX must be raised (e.g. 200): every test signs in a fresh user.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3001',
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'desktop', testMatch: ['flow.spec.ts', 'states.spec.ts'], use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testMatch: ['responsive.spec.ts'], use: { ...devices['Pixel 7'] } },
  ],
});
