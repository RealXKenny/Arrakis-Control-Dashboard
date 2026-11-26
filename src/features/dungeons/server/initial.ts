import '../../../lib/assert-server';
import type { BoardResponse } from '../model';
import { readDungeonBoard, refreshSeconds, toFreshness } from './leaderboard';

/** Server-render the shared board; a missing reading becomes the page's own unavailable state, never zeros. */
export async function loadInitialBoard(): Promise<BoardResponse | null> {
  try {
    const reading = await readDungeonBoard();
    return { ok: true, board: reading.data, freshness: toFreshness(reading), refreshSeconds: refreshSeconds() };
  } catch {
    return null;
  }
}
