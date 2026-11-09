import '../../../lib/assert-server';
import { readFileSync, statSync } from 'node:fs';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { checkServerIdentity, createSecureContext, type ConnectionOptions } from 'node:tls';
import type { ServerEnv } from '../../../config/env';

type TlsEnvironment = Pick<
  ServerEnv,
  | 'RABBITMQ_TLS_ENABLED'
  | 'RABBITMQ_TLS_CA'
  | 'RABBITMQ_TLS_CERT'
  | 'RABBITMQ_TLS_KEY'
  | 'RABBITMQ_TLS_CA_PATH'
  | 'RABBITMQ_TLS_CERT_PATH'
  | 'RABBITMQ_TLS_KEY_PATH'
  | 'RABBITMQ_TLS_REJECT_UNAUTHORIZED'
  | 'RABBITMQ_CA_FILE'
  | 'RABBITMQ_TLS_SERVERNAME'
>;

/** Values and OpenSSL errors must never escape this boundary (they can include PEM/key material). */
export class ChatTlsConfigurationError extends Error {
  constructor(setting: string) {
    super(`Invalid RabbitMQ TLS configuration: ${setting}. Check PEM material, trust and certificate/key pairing.`);
    this.name = 'ChatTlsConfigurationError';
  }
}

function material(
  inline: string | undefined,
  path: string | undefined,
  setting: string,
  maximum: number,
): string | undefined {
  try {
    if (inline !== undefined) return inline.replaceAll('\\n', '\n').replaceAll('\r\n', '\n').trim();
    if (!path) return undefined;
    if (statSync(path).size > maximum) throw new Error();
    return readFileSync(path, 'utf8').replaceAll('\r\n', '\n').trim();
  } catch {
    throw new ChatTlsConfigurationError(setting);
  }
}

function certificates(pem: string, setting: string): string[] {
  try {
    const blocks = pem.match(/-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----/g);
    if (!blocks?.length || blocks.length > 32 || blocks.join('').replace(/\s/g, '') !== pem.replace(/\s/g, ''))
      throw new Error();
    for (const block of blocks) new X509Certificate(block);
    return blocks;
  } catch {
    throw new ChatTlsConfigurationError(setting);
  }
}

/** Load once per validated ChatConfig; publisher and bridge reuse these options on every reconnect. */
export function loadChatTls(env: TlsEnvironment, url: URL): ConnectionOptions {
  const encrypted = url.protocol === 'amqps:';
  const supplied = [
    env.RABBITMQ_TLS_CA,
    env.RABBITMQ_TLS_CERT,
    env.RABBITMQ_TLS_KEY,
    env.RABBITMQ_TLS_CA_PATH,
    env.RABBITMQ_TLS_CERT_PATH,
    env.RABBITMQ_TLS_KEY_PATH,
    env.RABBITMQ_CA_FILE,
    env.RABBITMQ_TLS_SERVERNAME,
  ].some((value) => value !== undefined);
  if ((env.RABBITMQ_TLS_ENABLED !== undefined && env.RABBITMQ_TLS_ENABLED !== encrypted) || (!encrypted && supplied))
    throw new ChatTlsConfigurationError(
      'RABBITMQ_TLS_ENABLED must agree with the amqps:// URL; TLS material requires AMQPS',
    );
  if (env.RABBITMQ_TLS_REJECT_UNAUTHORIZED !== true)
    throw new ChatTlsConfigurationError('RABBITMQ_TLS_REJECT_UNAUTHORIZED must remain true');
  const options: ConnectionOptions = {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    checkServerIdentity,
    ...(env.RABBITMQ_TLS_SERVERNAME ? { servername: env.RABBITMQ_TLS_SERVERNAME } : {}),
  };
  if (!encrypted) return options;
  const ca = material(
    env.RABBITMQ_TLS_CA,
    env.RABBITMQ_TLS_CA_PATH ?? env.RABBITMQ_CA_FILE,
    'RABBITMQ_TLS_CA',
    262_144,
  );
  const cert = material(env.RABBITMQ_TLS_CERT, env.RABBITMQ_TLS_CERT_PATH, 'RABBITMQ_TLS_CERT', 262_144);
  const key = material(env.RABBITMQ_TLS_KEY, env.RABBITMQ_TLS_KEY_PATH, 'RABBITMQ_TLS_KEY', 65_536);
  if (ca !== undefined) options.ca = certificates(ca, 'RABBITMQ_TLS_CA');
  if ((cert === undefined) !== (key === undefined))
    throw new ChatTlsConfigurationError('both client certificate and private key are required for mutual TLS');
  if (cert !== undefined && key !== undefined) {
    const chain = certificates(cert, 'RABBITMQ_TLS_CERT');
    try {
      if (
        !/^-----BEGIN (?:RSA |EC |)PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]+-----END (?:RSA |EC |)PRIVATE KEY-----$/.test(
          key,
        )
      )
        throw new Error();
      const privateKey = createPrivateKey(key);
      if (!new X509Certificate(chain[0]).checkPrivateKey(privateKey)) throw new Error();
      options.cert = chain.join('\n');
      options.key = key;
    } catch {
      throw new ChatTlsConfigurationError('RABBITMQ_TLS_CERT / RABBITMQ_TLS_KEY');
    }
  }
  try {
    createSecureContext(options);
  } catch {
    throw new ChatTlsConfigurationError('CA bundle or client identity');
  }
  return options;
}
