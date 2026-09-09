import '../lib/assert-server';
import { getServerEnv, requireServerEnv } from '../config/env';
import {
  sendProviderRequest,
  providerUrl,
  DuneConsoleApiError,
  DiscordAdapterApiError,
  type HttpMethod,
} from './dunedocker/transport';

export type ConsoleRequestOptions = {
  authenticate?: boolean;
  query?: Record<string, unknown>;
  body?: unknown;
};
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
class DuneConsoleClient {
  readonly baseUrl: string;
  readonly adapterToken: string | null;
  readonly apiKey: string | null;
  constructor(baseUrl: string, adapterToken: string | null = null, apiKey: string | null = null) {
    this.baseUrl = new URL(baseUrl).toString().replace(/\/$/, '');
    this.adapterToken = adapterToken || getServerEnv().ADAPTER_TOKEN || null;
    this.apiKey = apiKey;
  }
  private headers(authenticate = true): Record<string, string> {
    return {
      Accept: 'application/json',
      ...(authenticate && this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }
  async request(method: HttpMethod, route: string, options: ConsoleRequestOptions = {}): Promise<unknown> {
    const { authenticate = true, query, body } = options;
    const url = providerUrl(this.baseUrl, route);
    for (const [key, value] of Object.entries(query ?? {}))
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    const result = await sendProviderRequest({
      provider: 'console',
      url,
      method,
      headers: {
        ...this.headers(authenticate),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      timeoutMs: getServerEnv().SITE_REQUEST_TIMEOUT_MS,
      retryRead: method === 'GET' || method === 'HEAD',
    });
    if (!result.response.ok || record(result.data).ok === false)
      throw new DuneConsoleApiError(undefined, result.response.status);
    return result.data;
  }
  async requestMultipart(method: HttpMethod, route: string, form: FormData): Promise<unknown> {
    const result = await sendProviderRequest({
      provider: 'console',
      url: providerUrl(this.baseUrl, route),
      method,
      headers: this.headers(),
      body: form,
      timeoutMs: 60000,
    });
    if (!result.response.ok || record(result.data).ok === false)
      throw new DuneConsoleApiError(undefined, result.response.status);
    return result.data;
  }
  async discordAdapterRequest(
    route: string,
    body: unknown = {},
    options: { retry?: boolean; timeout?: number } = {},
  ): Promise<unknown> {
    if (!this.adapterToken) throw new DiscordAdapterApiError('Discord adapter is not configured');
    const result = await sendProviderRequest({
      provider: 'adapter',
      url: providerUrl(this.baseUrl, route),
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.adapterToken}`,
      },
      body: JSON.stringify(body),
      timeoutMs: options.timeout ?? getServerEnv().SITE_REQUEST_TIMEOUT_MS,
      retryRead: options.retry === true && route === '/api/integrations/discord/players/me',
    });
    if (!result.response.ok || record(result.data).ok === false)
      throw new DiscordAdapterApiError(undefined, result.response.status);
    return result.data;
  }
}

let duneConsoleClientInstance: DuneConsoleClient | null = null;

function getDuneClient() {
  const env = getServerEnv();
  const consoleUrl = env.CONSOLE_URL;
  const adapterToken = env.ADAPTER_TOKEN;

  if (!consoleUrl) {
    throw new Error('CONSOLE_URL is not configured.');
  }

  if (!env.CONSOLE_API_KEY) throw new Error('CONSOLE_API_KEY is not configured.');

  if (!adapterToken) {
    throw new Error('ADAPTER_TOKEN is not configured.');
  }

  if (!duneConsoleClientInstance) {
    duneConsoleClientInstance = new DuneConsoleClient(consoleUrl, adapterToken, env.CONSOLE_API_KEY);
  }

  return duneConsoleClientInstance;
}

async function warmupDuneClient() {
  return getDuneClient();
}

export { DuneConsoleClient, DuneConsoleApiError, DiscordAdapterApiError, getDuneClient, warmupDuneClient };

/** Adapter transport only. Feature modules validate the linked-player contract. */
export async function getDiscordPlayer(actor: unknown): Promise<unknown> {
  const env = requireServerEnv('CONSOLE_URL', 'ADAPTER_TOKEN');
  return new DuneConsoleClient(env.CONSOLE_URL, env.ADAPTER_TOKEN).discordAdapterRequest(
    '/api/integrations/discord/players/me',
    { actor },
    { timeout: 15000 },
  );
}
