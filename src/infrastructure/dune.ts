import '../lib/assert-server';
import { getServerEnv, requireServerEnv } from '../config/env';
import { logger } from '../lib/logger';
import {
  sendProviderRequest,
  providerUrl,
  DuneConsoleApiError,
  DiscordAdapterApiError,
  type HttpMethod,
} from './dunedocker/transport';

export type ConsoleRequestOptions = {
  authenticate?: boolean;
  includeCsrf?: boolean;
  query?: Record<string, unknown>;
  body?: unknown;
  captureSession?: boolean;
  retryAuth?: boolean;
  waitForReady?: boolean;
};
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
class DuneConsoleClient {
  readonly baseUrl: string;
  readonly adapterToken: string | null;
  sessionCookie: string | null = null;
  csrfToken: string | null = null;
  password: string | null = null;
  reauthPromise: Promise<unknown> | null = null;
  initialAuthPromise: Promise<unknown> | null = null;
  constructor(baseUrl: string, adapterToken: string | null = null) {
    this.baseUrl = new URL(baseUrl).toString().replace(/\/$/, '');
    this.adapterToken = adapterToken || getServerEnv().ADAPTER_TOKEN || null;
  }
  async getAuthState(): Promise<unknown> {
    const response = await this.request('GET', '/api/auth/state', { waitForReady: false, retryAuth: false });
    const data = record(response);
    const token = data.csrfToken ?? data.csrf ?? data.token;
    if (typeof token === 'string') this.csrfToken = token;
    return response;
  }
  async login(password: string): Promise<unknown> {
    if (!password) throw new Error('Console password is not configured');
    this.password = password;
    const response = await this.request('POST', '/api/auth/login', {
      authenticate: false,
      body: { password },
      includeCsrf: false,
      captureSession: true,
      retryAuth: false,
    });
    if (!this.sessionCookie) throw new DuneConsoleApiError('Console authentication failed');
    await this.getAuthState();
    if (!this.csrfToken) throw new DuneConsoleApiError('Console authentication failed');
    return response;
  }
  async logout(): Promise<unknown> {
    try {
      return await this.request('POST', '/api/auth/logout', { body: {}, retryAuth: false });
    } finally {
      this.sessionCookie = null;
      this.csrfToken = null;
    }
  }
  async reauthenticate(): Promise<unknown> {
    if (!this.password) throw new DuneConsoleApiError('Console authentication unavailable');
    if (!this.reauthPromise)
      this.reauthPromise = this.login(this.password).finally(() => {
        this.reauthPromise = null;
      });
    return this.reauthPromise;
  }
  private headers(includeCsrf: boolean, authenticate = true): Record<string, string> {
    return {
      Accept: 'application/json',
      ...(authenticate && this.sessionCookie ? { Cookie: this.sessionCookie } : {}),
      ...(includeCsrf && this.csrfToken ? { 'x-csrf-token': this.csrfToken } : {}),
    };
  }
  captureSessionCookie(response: Response): void {
    const values = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
    const cookie = values.find((value) => value.startsWith('asc_session='));
    if (cookie) this.sessionCookie = cookie.split(';', 1)[0];
  }
  async request(method: HttpMethod, route: string, options: ConsoleRequestOptions = {}): Promise<unknown> {
    const {
      authenticate = true,
      includeCsrf = method !== 'GET' && method !== 'HEAD',
      query,
      body,
      captureSession = false,
      retryAuth = true,
      waitForReady = true,
    } = options;
    if (authenticate && waitForReady && this.initialAuthPromise) await this.initialAuthPromise;
    const url = providerUrl(this.baseUrl, route);
    for (const [key, value] of Object.entries(query ?? {}))
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    const result = await sendProviderRequest({
      provider: 'console',
      url,
      method,
      headers: {
        ...this.headers(includeCsrf, authenticate),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      retryRead: method === 'GET' || method === 'HEAD',
    });
    if (captureSession) this.captureSessionCookie(result.response);
    if (result.response.status === 401 && authenticate && retryAuth && this.password) {
      await this.reauthenticate();
      return this.request(method, route, { ...options, retryAuth: false });
    }
    if (!result.response.ok || record(result.data).ok === false)
      throw new DuneConsoleApiError(undefined, result.response.status);
    return result.data;
  }
  async requestMultipart(method: HttpMethod, route: string, form: FormData, retryAuth = false): Promise<unknown> {
    const result = await sendProviderRequest({
      provider: 'console',
      url: providerUrl(this.baseUrl, route),
      method,
      headers: this.headers(true),
      body: form,
      timeoutMs: 60000,
    });
    if (result.response.status === 401 && retryAuth && this.password) {
      await this.reauthenticate();
      return this.requestMultipart(method, route, form, false);
    }
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
      timeoutMs: options.timeout ?? 30000,
      retryRead: options.retry === true && route === '/api/integrations/discord/players/me',
    });
    if (!result.response.ok || record(result.data).ok === false)
      throw new DiscordAdapterApiError(undefined, result.response.status);
    return result.data;
  }
}

let duneConsoleClientInstance: DuneConsoleClient | null = null;

function getDuneClient() {
  const consoleUrl = getServerEnv().CONSOLE_URL;

  const consolePassword = getServerEnv().CONSOLE_PASSWORD;

  const adapterToken = getServerEnv().ADAPTER_TOKEN;

  if (!consoleUrl) {
    throw new Error('CONSOLE_URL is not configured.');
  }

  if (!consolePassword) {
    throw new Error('CONSOLE_PASSWORD is not configured.');
  }

  if (!adapterToken) {
    throw new Error('ADAPTER_TOKEN is not configured.');
  }

  if (!duneConsoleClientInstance) {
    duneConsoleClientInstance = new DuneConsoleClient(consoleUrl, adapterToken);

    /*
     * Start authentication.
     *
     * Do not make requests wait for this promise here.
     * login() is responsible for creating the Console session.
     */
    duneConsoleClientInstance.initialAuthPromise = duneConsoleClientInstance.login(consolePassword).catch((error) => {
      logger.error('Initial Dune console login failed.', error);

      throw error;
    });
    // Observe startup rejection even when a read-only adapter caller does not await warmup.
    void duneConsoleClientInstance.initialAuthPromise.catch(() => undefined);
  }

  return duneConsoleClientInstance;
}

async function warmupDuneClient() {
  const client = getDuneClient();

  if (client.initialAuthPromise) {
    await client.initialAuthPromise;
  }

  return client;
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
