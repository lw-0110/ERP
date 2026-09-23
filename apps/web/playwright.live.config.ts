import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-live',
  timeout: 90_000,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
});
