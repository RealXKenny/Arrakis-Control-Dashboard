import '../../../lib/assert-server';
import type { BoardResponse } from '../model';
import { REFRESH_SECONDS, peekSolarisBoard, publicBoard, toFreshness } from './leaderboard';

/**
 * Server-render the cached board only. A crawl reads every character, so opening the page never starts one; with no
 * cached reading the browser asks the API, which runs the single coordinated crawl.
 */
export async function loadInitialBoard(): Promise<BoardResponse | null> {
  try {
    const reading = await peekSolarisBoard();
    if (!reading) return null;
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
