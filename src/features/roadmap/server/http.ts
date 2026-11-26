import '../../../lib/assert-server';
import { json } from '../../../server/http';
import { spendReadBudget } from '../../../server/read-budget';
import type { RoadmapResponse } from '../model';
import { readRoadmap, roadmapRefreshSeconds } from './roadmap';

/** Public, read-only, served from the shared cache. Visitors never cause their own GitHub request. */
export async function loadRoadmapResponse(): Promise<RoadmapResponse | null> {
  try {
    const reading = await readRoadmap();
    return {
      ok: true,
      roadmap: reading.data,
      freshness: { fetchedAt: reading.fetchedAt, state: reading.state, refreshFailed: reading.refreshFailed },
      refreshSeconds: roadmapRefreshSeconds(),
    };
  } catch {
    return null;
  }
}

export async function roadmapApi(): Promise<Response> {
  const budget = await spendReadBudget();
  if (!budget.allowed)
    return json({ ok: false, error: 'Too many requests. Try again shortly.' }, 429, {
      'Retry-After': String(Math.max(1, budget.retryAfter)),
    });
  const response = await loadRoadmapResponse();
  return response ? json(response) : json({ ok: false, error: 'The roadmap is temporarily unavailable.' }, 503);
}
