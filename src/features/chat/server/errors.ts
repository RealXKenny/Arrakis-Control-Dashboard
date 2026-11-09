export function describeChatConnectionError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Unrecognized RabbitMQ failure.';
  const value = error as { code?: unknown; message?: unknown; errors?: unknown };
  if (Array.isArray(value.errors) && value.errors.length)
    return [...new Set(value.errors.slice(0, 4).map(describeChatConnectionError))].join(' ');
  const descriptions: Record<string, string> = {
    ECONNREFUSED: 'Connection refused; check the AMQP listener and network route.',
    ETIMEDOUT: 'Connection timed out; check routing and firewall access.',
    ENOTFOUND: 'Broker hostname could not be resolved.',
    EAI_AGAIN: 'Temporary DNS lookup failure.',
    ECONNRESET: 'Connection reset; verify the AMQP/TLS listener.',
    ERR_TLS_CERT_ALTNAME_INVALID: 'Broker hostname does not match its TLS certificate.',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'Configure RABBITMQ_CA_FILE with the trusted broker CA.',
    SELF_SIGNED_CERT_IN_CHAIN: 'Configure RABBITMQ_CA_FILE with the trusted broker CA.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Configure RABBITMQ_TLS_CA with the issuing CA chain.',
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'Configure RABBITMQ_TLS_CA with the issuing CA chain.',
    CERT_HAS_EXPIRED: 'The broker certificate has expired; renew it and its configured trust material.',
    ERR_SSL_WRONG_VERSION_NUMBER: 'The endpoint may be plaintext or HTTP rather than AMQPS.',
  };
  const code = typeof value.code === 'string' || typeof value.code === 'number' ? String(value.code) : '';
  if (descriptions[code]) return descriptions[code];
  const message = typeof value.message === 'string' ? value.message : '';
  if (/ACCESS_REFUSED|\b403\b|login was refused/i.test(message))
    return 'RabbitMQ authentication or resource access refused.';
  if (/NOT_FOUND|\b404\b/i.test(message)) return 'RabbitMQ exchange or virtual host not found.';
  if (/NOT_ALLOWED|\b530\b/i.test(message)) return 'RabbitMQ refused the operation; check virtual-host permissions.';
  if (/timed?\s*out|timeout/i.test(message)) return descriptions.ETIMEDOUT;
  return 'Unrecognized RabbitMQ failure; inspect broker logs.';
}
