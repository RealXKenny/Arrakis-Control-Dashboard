import { describe, expect, it } from 'vitest';
import { readSeasonResponse, retryDelayMs, SeasonResponseError } from '../../../src/features/seasons/response';

const html = (status: number) =>
  new Response('<!DOCTYPE html><html><body>Bad gateway</body></html>', {
    status,
    headers: { 'Content-Type': 'text/html' },
  });

describe('season response reading', () => {
  it('turns an HTML error page into a clear, retryable message instead of a JSON parser error', async () => {
    const error = await readSeasonResponse(html(502)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SeasonResponseError);
    expect((error as SeasonResponseError).message).toContain('HTTP 502');
    expect((error as SeasonResponseError).message).not.toContain('Unexpected token');
    expect((error as SeasonResponseError).retryable).toBe(true);
    // A proxy page with a success status is still not season data.
    await expect(readSeasonResponse(html(200))).rejects.toMatchObject({ retryable: true, status: 200 });
  });

  it('passes server messages through and only retries transient statuses', async () => {
    const refusal = Response.json({ ok: false, error: 'A verified linked character is required.' }, { status: 403 });
    await expect(readSeasonResponse(refusal)).rejects.toMatchObject({
      message: 'A verified linked character is required.',
      retryable: false,
    });
    const limited = Response.json(
      { ok: false, error: 'Objective verification is temporarily limited.' },
      { status: 429 },
    );
    await expect(readSeasonResponse(limited)).rejects.toMatchObject({ retryable: true });
    await expect(readSeasonResponse(new Response('', { status: 500 }))).rejects.toMatchObject({
      message: 'Season request failed. (HTTP 500)',
      retryable: true,
    });
    await expect(readSeasonResponse<{ ok: boolean }>(Response.json({ ok: true }))).resolves.toEqual({ ok: true });
  });

  it('backs off between automatic retries up to five minutes', () => {
    expect([1, 2, 3, 4, 9].map(retryDelayMs)).toEqual([30000, 60000, 120000, 240000, 300000]);
  });
});
