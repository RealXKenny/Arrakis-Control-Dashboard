import '../../lib/assert-server';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { WebhookPayload } from '../../features/changelog/discord';

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_CHARS = 16_384;
const messageSchema = z.object({ id: z.string().regex(/^\d{15,25}$/) });

export type WebhookResult = { status: 'ok'; messageId: string } | { status: 'missing' };

/**
 * Create (POST) or edit (PATCH) a webhook message.
 * `with_components=true` is what lets a plain, non-application webhook carry link buttons.
 */
export async function executeWebhook(
  webhookUrl: string,
  payload: WebhookPayload,
  editMessageId?: string,
): Promise<WebhookResult> {
  const url = new URL(webhookUrl);
  if (editMessageId) url.pathname += `/messages/${encodeURIComponent(editMessageId)}`;
  url.searchParams.set('with_components', 'true');
  if (!editMessageId) url.searchParams.set('wait', 'true');

  let response: Response;
  try {
    response = await fetch(url, {
      method: editMessageId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // A webhook URL never redirects; refuse to follow one anywhere else.
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    // The URL embeds the token, so the error object is deliberately not logged.
    logger.warn('Discord webhook request failed to complete');
    throw new AppError('Discord could not be reached. Try again shortly.', 502, 'DISCORD_UNREACHABLE', true);
  }

  const body = (await response.text()).slice(0, MAX_RESPONSE_CHARS);

  if (editMessageId && response.status === 404) return { status: 'missing' };

  if (response.status === 429) {
    let retry = Number(response.headers.get('retry-after'));
    if (!Number.isFinite(retry) || retry <= 0) {
      try {
        retry = Number((JSON.parse(body) as { retry_after?: unknown }).retry_after);
      } catch {
        retry = 30;
      }
    }
    const seconds = Math.min(3600, Math.max(1, Math.ceil(Number.isFinite(retry) ? retry : 30)));
    throw new AppError(
      `Discord is rate limiting announcements. Retry in ${seconds}s.`,
      429,
      'DISCORD_RATE_LIMITED',
      true,
    );
  }

  if (!response.ok) {
    logger.warn('Discord rejected a webhook announcement', { status: response.status });
    throw new AppError('Discord rejected the announcement.', 502, 'DISCORD_REJECTED', true);
  }

  if (editMessageId) return { status: 'ok', messageId: editMessageId };
  let parsed: z.infer<typeof messageSchema>;
  try {
    parsed = messageSchema.parse(JSON.parse(body));
  } catch {
    throw new AppError('Discord returned an unexpected response.', 502, 'DISCORD_BAD_RESPONSE', true);
  }
  return { status: 'ok', messageId: parsed.id };
}
