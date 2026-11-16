import '../../../lib/assert-server';
import { z } from 'zod';
import type { ActivityView } from '../model';
import { readActivityViews } from './store';
export type ResolvedActivity =
  { status: 'none' } | { status: 'missing' | 'unavailable' } | { status: 'ok'; view: ActivityView };
export async function resolveActivity(owner: string, id: unknown): Promise<ResolvedActivity> {
  if (id === undefined) return { status: 'none' };
  if (!z.uuid().safeParse(id).success) return { status: 'missing' };
  try {
    const view = (await readActivityViews(owner)).views.find((v) => v.id === id);
    return view ? { status: 'ok', view } : { status: 'missing' };
  } catch {
    return { status: 'unavailable' };
  }
}
