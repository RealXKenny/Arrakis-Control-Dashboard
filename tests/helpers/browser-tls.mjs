import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:https';
import { request } from 'node:http';

/** Local HTTPS fixture, preserving the production CSP and origin checks for WebKit. */
export function startBrowserTls(upstreamPort) {
  const directory = mkdtempSync(join(tmpdir(), 'arrakis-browser-tls-'));
  const key = join(directory, 'key.pem');
  const cert = join(directory, 'cert.pem');
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
        '-keyout',
        key,
        '-out',
        cert,
      ],
      { stdio: 'ignore', windowsHide: true },
    );
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (incoming, outgoing) => {
    const proxy = request(
      {
        host: '127.0.0.1',
        port: upstreamPort,
        path: incoming.url,
        method: incoming.method,
        headers: { ...incoming.headers, 'x-forwarded-proto': 'https' },
      },
      (response) => {
        outgoing.writeHead(response.statusCode, response.headers);
        response.pipe(outgoing);
      },
    );
    proxy.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(503);
      outgoing.end();
    });
    incoming.on('aborted', () => proxy.destroy());
    incoming.pipe(proxy);
  });
  server.listen(3443, '127.0.0.1');
  return {
    close: () => {
      server.closeAllConnections();
      server.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
