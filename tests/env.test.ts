import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('accepts empty optional monitoring settings from the environment template', async () => {
  vi.resetModules();
  vi.stubEnv('SENTRY_DSN', '');
  vi.stubEnv('SENTRY_AUTH_TOKEN', '');
  const { getServerEnv } = await import('../src/config/env');
  expect(getServerEnv().SENTRY_DSN).toBeUndefined();
  expect(getServerEnv().SENTRY_AUTH_TOKEN).toBeUndefined();
});

it('rejects invalid settings without echoing their values', async () => {
  vi.resetModules();
  vi.stubEnv('CONSOLE_URL', 'private-invalid-url');
  const { getServerEnv } = await import('../src/config/env');
  expect(getServerEnv).toThrow('Invalid server environment configuration: CONSOLE_URL');
});

it('accepts the environment template with RabbitMQ safely disabled', async () => {
  vi.resetModules();
  const template = parse(readFileSync('.env.example'));
  for (const [key, value] of Object.entries(template)) vi.stubEnv(key, value);
  const { getServerEnv } = await import('../src/config/env');
  const env = getServerEnv();
  expect(env.LIVE_EVENTS_ENABLED).toBe('false');
  expect(env.RABBITMQ_URL).toBeUndefined();
  expect(env.RABBITMQ_MANAGEMENT_URL).toBeUndefined();
  expect(env.LIVE_EVENTS_ADMIN_ROLE_IDS).toBe('');
});

it('rejects plaintext AMQP without exposing credentials', async () => {
  vi.resetModules();
  vi.stubEnv('RABBITMQ_URL', 'amqp://observer:private-password@broker:5672/%2F');
  const { getServerEnv } = await import('../src/config/env');
  expect(getServerEnv).toThrow('Invalid server environment configuration: RABBITMQ_URL');
});
