import '../../../lib/assert-server';
import { record } from '../../player/inventory';
import { NextResponse } from '../../../server/pages-api';
import { cookies } from '../../../server/cookies';
import { getDuneClient } from '../../../server/integrations/dune';
import { getSession } from '../../auth/server/session';

export async function GET(req, res) {
  const sessionId = cookies(req, res).get('dashboard_session')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!sessionId || !session || session.expiresAt < Date.now()) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const market = record(await getDuneClient().request('GET', '/api/exchange/market'));
    const buybackPercent =
      record(market.buyback).buybackPercent ??
      record(market.buybackSchedule).buybackPercent ??
      record(market.schedule).buybackPercent ??
      market?.buybackPercent ??
      null;
    return NextResponse.json({ ok: true, buybackPercent }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Unable to load market config' }, { status: 502 });
  }
}
