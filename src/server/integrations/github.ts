import '../../lib/assert-server';
import { readBoundedText } from '../../lib/http/response';
import { createLogger } from '../../lib/logger';

/**
 * Minimal read-only GitHub REST client for public repository data. Server-only: the optional token never reaches
 * the browser, is never logged and is only ever sent to api.github.com. Conditional requests (ETag) keep refreshes
 * that find nothing new from counting against the rate limit.
 */
const API = 'https://api.github.com';
const MAX_BYTES = 4 * 1024 * 1024;
const log = createLogger('GITHUB');

class GitHubReadError extends Error {
  constructor(
    readonly status: number,
    readonly rateLimited = false,
  ) {
    super(rateLimited ? 'GitHub rate limit reached' : 'GitHub request failed');
    this.name = 'GitHubReadError';
  }
}

export type GitHubPage = { notModified: true } | { notModified: false; data: unknown; etag: string | null };

export async function githubGet(
  path: string,
  options: { token?: string; etag?: string | null; timeoutMs?: number } = {},
): Promise<GitHubPage> {
  if (!/^\/repos\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9/_?=&.,%:-]{1,300}$/.test(path))
    throw new Error('Invalid GitHub path');
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'arrakis-control-dashboard',
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.etag) headers['If-None-Match'] = options.etag;
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      headers,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
  } catch {
    log.debug('GitHub request failed', { route: path.split('?')[0] });
    throw new GitHubReadError(0);
  }
  if (response.status === 304) return { notModified: true };
  if (!response.ok) {
    const rateLimited =
      response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
    log.debug('GitHub request refused', { route: path.split('?')[0], status: response.status, rateLimited });
    throw new GitHubReadError(response.status, rateLimited);
  }
  const text = await readBoundedText(response, MAX_BYTES);
  try {
    return { notModified: false, data: JSON.parse(text) as unknown, etag: response.headers.get('etag') };
  } catch {
    throw new GitHubReadError(response.status);
  }
}
