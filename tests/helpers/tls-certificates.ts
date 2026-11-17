import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Disposable local certificates: no committed private keys or deployment trust material. */
export function createTlsCertificates() {
  const directory = mkdtempSync(join(tmpdir(), 'arrakis-tls-'));
  const certPath = join(directory, 'cert.pem');
  const keyPath = join(directory, 'key.pem');
  const gitOpenSsl = 'C:/Program Files/Git/usr/bin/openssl.exe';
  const openssl = process.platform === 'win32' && existsSync(gitOpenSsl) ? gitOpenSsl : 'openssl';
  try {
    execFileSync(
      openssl,
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '2',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
        '-addext',
        'extendedKeyUsage=serverAuth,clientAuth',
        '-keyout',
        keyPath,
        '-out',
        certPath,
      ],
      { stdio: 'ignore' },
    );
    return {
      certPath,
      keyPath,
      cert: readFileSync(certPath, 'utf8'),
      key: readFileSync(keyPath, 'utf8'),
      close: () => rmSync(directory, { recursive: true, force: true }),
    };
  } catch {
    rmSync(directory, { recursive: true, force: true });
    throw new Error('Disposable TLS test certificates require OpenSSL on PATH (or Git for Windows).');
  }
}
