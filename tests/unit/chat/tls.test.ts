import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { X509Certificate } from 'node:crypto';
import { connect, createServer, checkServerIdentity } from 'node:tls';
import { parse } from 'dotenv';
import { createTlsCertificates } from '../../helpers/tls-certificates';
import { loadChatTls } from '../../../src/features/chat/server/tls';
import { describeChatConnectionError } from '../../../src/features/chat/server/errors';
import { createLogger } from '../../../src/lib/logger';

let fixture: ReturnType<typeof createTlsCertificates>;
let other: ReturnType<typeof createTlsCertificates>;
beforeAll(() => {
  fixture = createTlsCertificates();
  other = createTlsCertificates();
});
afterAll(() => {
  fixture?.close();
  other?.close();
});
const url = new URL('amqps://fixture:fixture@localhost/');
const settings = (patch = {}) => ({ RABBITMQ_TLS_REJECT_UNAUTHORIZED: true as const, ...patch });

describe('RabbitMQ inline TLS configuration', () => {
  it('redacts TLS material in structured logs and sanitizes connection diagnostics', () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      createLogger('TLS TEST', 'INFO').info('Configuration checked', {
        RABBITMQ_TLS_KEY: fixture.key,
        RABBITMQ_TLS_CA: fixture.cert,
        cert: fixture.cert,
        key: fixture.key,
      });
      expect(JSON.stringify(output.mock.calls)).not.toContain('BEGIN');
      expect(JSON.stringify(output.mock.calls)).toContain('[REDACTED]');
      const diagnostic = describeChatConnectionError(new Error(`amqps://user:secret@host ${fixture.key}`));
      expect(diagnostic).not.toMatch(/BEGIN|secret|amqps/);
    } finally {
      output.mockRestore();
    }
  });
  it('loads full multiline and escaped PEM values through dotenv', () => {
    for (const value of [fixture.cert, fixture.cert.replaceAll('\n', '\\n')]) {
      const env = parse(`RABBITMQ_TLS_CA="${value}"`);
      expect(loadChatTls(settings(env), url).ca).toEqual([fixture.cert.trim()]);
    }
  });
  it('accepts multiple trusted certificates', () => {
    expect(loadChatTls(settings({ RABBITMQ_TLS_CA: fixture.cert + other.cert }), url).ca).toHaveLength(2);
  });
  it('prefers inline material and never reads or falls back to the configured path', () => {
    expect(
      loadChatTls(settings({ RABBITMQ_TLS_CA: fixture.cert, RABBITMQ_TLS_CA_PATH: 'missing.pem' }), url).ca,
    ).toHaveLength(1);
    expect(() =>
      loadChatTls(
        settings({ RABBITMQ_TLS_CA: 'malformed-sensitive-value', RABBITMQ_TLS_CA_PATH: fixture.certPath }),
        url,
      ),
    ).toThrow('Invalid RabbitMQ TLS configuration');
  });
  it('preserves both new and legacy path-only CA configurations', () => {
    for (const patch of [{ RABBITMQ_CA_FILE: fixture.certPath }, { RABBITMQ_TLS_CA_PATH: fixture.certPath }])
      expect(loadChatTls(settings(patch), url).ca).toEqual([fixture.cert.trim()]);
  });
  it('bounds file reads before trimming and keeps oversized material out of errors', () => {
    const oversized = join(dirname(fixture.certPath), 'oversized.pem');
    writeFileSync(oversized, fixture.cert + ' '.repeat(262_144));
    expect(() => loadChatTls(settings({ RABBITMQ_TLS_CA_PATH: oversized }), url)).toThrow(
      'Invalid RabbitMQ TLS configuration: RABBITMQ_TLS_CA.',
    );
    expect(loadChatTls(settings({ RABBITMQ_TLS_CA_PATH: fixture.certPath }), url).ca).toEqual([fixture.cert.trim()]);
  });
  it('loads matching inline and path client identities', () => {
    for (const patch of [
      { RABBITMQ_TLS_CERT: fixture.cert, RABBITMQ_TLS_KEY: fixture.key },
      { RABBITMQ_TLS_CERT_PATH: fixture.certPath, RABBITMQ_TLS_KEY_PATH: fixture.keyPath },
    ]) {
      const result = loadChatTls(settings(patch), url);
      expect(result.cert).toBe(fixture.cert.trim());
      expect(result.key).toBe(fixture.key.trim());
    }
  });
  it('rejects incomplete, malformed or mismatched client identities without leaking material', () => {
    for (const patch of [
      { RABBITMQ_TLS_CERT: fixture.cert },
      { RABBITMQ_TLS_KEY: fixture.key },
      { RABBITMQ_TLS_CERT: fixture.cert, RABBITMQ_TLS_KEY: other.key },
      { RABBITMQ_TLS_CERT: fixture.cert, RABBITMQ_TLS_KEY: 'sensitive-invalid-private-key' },
      { RABBITMQ_TLS_CA: fixture.cert + '\nextra-sensitive-data' },
    ]) {
      let caught: unknown;
      try {
        loadChatTls(settings(patch), url);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(String(caught)).not.toMatch(/BEGIN|sensitive|MIIC|PRIVATE KEY/);
    }
  });
  it('keeps secure defaults and real hostname verification, rejecting protocol conflicts', () => {
    const options = loadChatTls(settings(), url);
    expect(options.rejectUnauthorized).toBe(true);
    expect(options.checkServerIdentity).toBe(checkServerIdentity);
    expect(options.ca).toBeUndefined();
    const certificate = new X509Certificate(fixture.cert).toLegacyObject();
    expect(options.checkServerIdentity!('localhost', certificate)).toBeUndefined();
    expect(options.checkServerIdentity!('wrong.example', certificate)).toMatchObject({
      code: 'ERR_TLS_CERT_ALTNAME_INVALID',
    });
    expect(() => loadChatTls(settings({ RABBITMQ_TLS_ENABLED: true }), new URL('amqp://localhost'))).toThrow('AMQPS');
    expect(() => loadChatTls(settings({ RABBITMQ_TLS_ENABLED: false }), url)).toThrow('AMQPS');
  });
  it('completes a real loopback mutual TLS handshake using inline material', async () => {
    const server = createServer(
      { cert: fixture.cert, key: fixture.key, ca: fixture.cert, requestCert: true, rejectUnauthorized: true },
      (socket) => socket.end(),
    );
    server.on('tlsClientError', () => undefined);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address() as { port: number };
    const options = loadChatTls(
      settings({
        RABBITMQ_TLS_CA: fixture.cert,
        RABBITMQ_TLS_CERT: fixture.cert,
        RABBITMQ_TLS_KEY: fixture.key,
        RABBITMQ_TLS_SERVERNAME: 'localhost',
      }),
      url,
    );
    const client = connect({ ...options, host: '127.0.0.1', port: address.port });
    try {
      await once(client, 'secureConnect');
      expect(client.authorized).toBe(true);
    } finally {
      client.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
