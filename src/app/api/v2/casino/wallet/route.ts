import { loadWallet, walletEntries } from '../../../../../features/casino/server/service';
import { json, requireApiSession, route } from '../../../../../server/http';

/** The signed-in member's casino wallet. Read-only: Solaris only moves through confirmed transfers and settled rounds. */
export const GET = route(async (request: Request) => {
  const session = await requireApiSession();
  const url = new URL(request.url);
  const wallet = await loadWallet(session);
  if (url.searchParams.get('entries') === null) return json({ ok: true, wallet });
  const offset = Number(url.searchParams.get('offset') ?? 0);
  return json({ ok: true, wallet, entries: await walletEntries(session, Number.isFinite(offset) ? offset : 0) });
});
