import '../../../lib/assert-server';
import { record } from '../utils/inventory';
import { NextResponse } from '../../../infrastructure/pages-api';
import { cookies } from '../../../infrastructure/cookies';
import { getDuneClient } from '../../../infrastructure/dune';
import { getSession } from '../../../lib/session-store';

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
