import '../../lib/assert-server';

/** Privileged Console operations require HTTPS, or plain HTTP only on this machine. */
export function isSecureConsoleOrigin(value: string | undefined) {
  if (!value || !URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  );
}
