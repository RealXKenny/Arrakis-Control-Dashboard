import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseChatServers } from '../../../src/features/chat/server/config';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('chat configuration', () => {
  it('parses unique public destinations without adding credentials', () => {
    expect(parseChatServers('[{"id":"hagga-basin","label":"Hagga Basin","map":"HaggaBasin.0"}]')).toEqual([
      { id: 'hagga-basin', label: 'Hagga Basin', map: 'HaggaBasin.0' },
    ]);
  });

  it('rejects duplicate IDs/maps and invalid routing keys', () => {
    expect(() =>
      parseChatServers(
        '[{"id":"one","label":"One","map":"HaggaBasin.0"},{"id":"two","label":"Two","map":"HaggaBasin.0"}]',
      ),
    ).toThrow('CHAT_SERVERS');
    expect(() => parseChatServers('[{"id":"one","label":"One","map":"#"}]')).toThrow('CHAT_SERVERS');
  });

  it('loads the existing persona protocol and heartbeat only when enabled', async () => {
    vi.stubEnv('CHAT_ENABLED', 'true');
    vi.stubEnv('RABBITMQ_URL', 'amqps://5E121CE000000001:secret@remote.example.com:31982/');
    vi.stubEnv('CHAT_BRIDGE_FUNCOM_ID', 'ArrakisControl#0001');
    vi.stubEnv('CHAT_SERVERS', '[{"id":"hagga-basin","label":"Hagga Basin","map":"HaggaBasin.0"}]');
    const { getChatConfig } = await import('../../../src/features/chat/server/config');
    const config = getChatConfig()!;
    expect(config.url).toBe('amqps://5E121CE000000001:secret@remote.example.com:31982/%2F?heartbeat=30');
    expect(config.username).toBe('5E121CE000000001');
    expect(config.servers[0].map).toBe('HaggaBasin.0');
  });

  it('fails closed for an invalid persona or TLS identity', async () => {
    vi.stubEnv('CHAT_ENABLED', 'true');
    vi.stubEnv('RABBITMQ_URL', 'amqp://not-a-persona:secret@remote.example.com/');
    vi.stubEnv('CHAT_BRIDGE_FUNCOM_ID', 'ArrakisControl#0001');
    vi.stubEnv('CHAT_SERVERS', '[{"id":"one","label":"One","map":"HaggaBasin.0"}]');
    const { getChatConfig } = await import('../../../src/features/chat/server/config');
    expect(getChatConfig).toThrow('16-character');
  });

  it('refuses disabling certificate verification without exposing environment values', async () => {
    vi.stubEnv('RABBITMQ_TLS_REJECT_UNAUTHORIZED', 'false');
    const { getServerEnv } = await import('../../../src/config/env');
    expect(getServerEnv).toThrow('Invalid server environment configuration: RABBITMQ_TLS_REJECT_UNAUTHORIZED');
  });
});
