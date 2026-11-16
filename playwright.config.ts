import { defineConfig, devices } from '@playwright/test';

const browserServer = {
  // Dev note: production credentials are not invited to this test party.
  env: {
    // browser-server.mjs points this at the local fake Console it starts.
    CONSOLE_URL: 'http://127.0.0.1:3101',
    CONSOLE_API_KEY: 'browser-test-placeholder',
    ADAPTER_TOKEN: 'browser-test-placeholder',
    DISCORD_CLIENT_ID: 'browser-test-client',
    DISCORD_CLIENT_SECRET: 'browser-test-placeholder',
    DISCORD_GUILD_ID: 'browser-test-guild',
    VERIFIED_MEMBER_ROLE_ID: 'browser-test-role',
    ADMIN_DISCORD_IDS: '456084885220884480',
    ADMIN_CONSOLE_API_KEY: 'browser-test-admin-placeholder',
    AUTH_SECRET: 'fixture-only-authentication-secret-32',
    APP_URL: 'http://127.0.0.1:3100',
    REDIS_URL: 'redis://127.0.0.1:9',
    CHAT_ENABLED: 'true',
    // The casino is off by default; the browser fixture turns it on so the real flows can be exercised.
    CASINO_SOLARIS_ENABLED: 'true',
    RABBITMQ_URL: 'amqps://5E121CE000000001:browser-test-placeholder@rabbit.test/',
    CHAT_BRIDGE_FUNCOM_ID: 'ArrakisControl#0001',
    CHAT_SERVERS:
      '[{"id":"hagga-basin","label":"Hagga Basin","map":"HaggaBasin.0"},{"id":"deep-desert","label":"Deep Desert","map":"DeepDesert_1.0"}]',
    LOG_LEVEL: 'FATAL',
  },
  command: 'node tests/helpers/browser-server.mjs',
  url: 'http://127.0.0.1:3100',
  reuseExistingServer: !process.env.CI,
};

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  // Software WebGL contexts share CPU; bound renderer-test contention.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'season-safari',
      testMatch: '**/seasons-cross-browser.spec.ts',
      use: {
        ...devices['Desktop Safari'],
        browserName: 'webkit',
        baseURL: 'https://127.0.0.1:3443',
        ignoreHTTPSErrors: true,
      },
    },
    {
      name: 'season-iphone',
      testMatch: '**/seasons-cross-browser.spec.ts',
      use: {
        ...devices['iPhone 13'],
        browserName: 'webkit',
        baseURL: 'https://127.0.0.1:3443',
        ignoreHTTPSErrors: true,
      },
    },
    {
      name: 'season-android',
      testMatch: '**/seasons-cross-browser.spec.ts',
      use: { ...devices['Galaxy S9+'], viewport: { width: 412, height: 915 }, browserName: 'chromium' },
    },
  ],
  webServer: [
    browserServer,
    {
      ...browserServer,
      command: 'node tests/helpers/browser-server.mjs --tls',
      url: 'https://127.0.0.1:3443',
      ignoreHTTPSErrors: true,
      env: { ...browserServer.env, APP_URL: 'https://127.0.0.1:3443' },
    },
  ],
});
