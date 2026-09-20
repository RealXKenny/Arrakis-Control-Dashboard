import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Dev note: production credentials are not invited to this test party.
    env: {
      CONSOLE_URL: 'http://127.0.0.1:9',
      CONSOLE_API_KEY: 'browser-test-placeholder',
      ADAPTER_TOKEN: 'browser-test-placeholder',
      DISCORD_CLIENT_ID: 'browser-test-client',
      DISCORD_CLIENT_SECRET: 'browser-test-placeholder',
      DISCORD_GUILD_ID: 'browser-test-guild',
      APP_URL: 'http://127.0.0.1:3100',
      REDIS_URL: 'redis://127.0.0.1:9',
    },
    command: 'npx next start --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
  },
});
