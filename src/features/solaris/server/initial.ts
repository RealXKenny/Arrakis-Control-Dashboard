import '../../../lib/assert-server';
import type { BoardResponse } from '../model';
import { REFRESH_SECONDS, peekSolarisBoard, publicBoard, readSolarisBoard, toFreshness } from './leaderboard';

/**
 * Server-render the cached board only, never waiting for a crawl. A stale reading is still shown, and one coordinated
 * background refresh starts right away (a stale read returns at once), so the next check sees new numbers. With no
 * cached reading the browser asks the API, which runs the single coordinated crawl.
 */
export async function loadInitialBoard(): Promise<BoardResponse | null> {
  try {
    const reading = await peekSolarisBoard();
    if (!reading) return null;
    if (reading.state === 'stale') void readSolarisBoard().catch(() => undefined);
    return {
      ok: true,
      board: publicBoard(reading.data),
      freshness: toFreshness(reading),
      refreshSeconds: REFRESH_SECONDS,
    };
  } catch {
    return null;
  }
}
