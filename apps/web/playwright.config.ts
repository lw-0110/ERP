import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: [
    { command: 'corepack pnpm --filter @platform/api dev', url: 'http://127.0.0.1:3000/health/ready', reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: 'corepack pnpm --filter @platform/web dev --host 127.0.0.1 --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
