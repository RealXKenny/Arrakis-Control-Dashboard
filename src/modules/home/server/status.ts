import '../../../lib/assert-server';
import { record } from '../../../lib/value';
import { NextResponse } from '../../../infrastructure/pages-api';

import { getDuneClient } from '../../../infrastructure/dune';
import { logger } from '../../../lib/logger';

export async function GET() {
  try {
    const duneClient = await getDuneClient();

    const [onlineRaw, playersRaw] = await Promise.all([
      duneClient.request('GET', '/api/players/online?page=0&pageSize=100'),
      duneClient.request('GET', '/api/players?page=1&pageSize=1'),
    ]);

    const onlinePlayers = record(onlineRaw),
      playersData = record(playersRaw);
    const activePlayers = Number(
      onlinePlayers?.totalCount ??
        onlinePlayers?.totalPlayers ??
        onlinePlayers?.count ??
        record(onlinePlayers.pagination).total ??
        record(onlinePlayers.pagination).totalCount ??
        record(onlinePlayers.meta).total ??
        record(onlinePlayers.meta).totalCount ??
        0,
    );

    const totalPlayers = Number(
      playersData?.totalCount ??
        playersData?.totalPlayers ??
        playersData?.count ??
        record(playersData.pagination).total ??
        record(playersData.pagination).totalCount ??
        record(playersData.meta).total ??
        record(playersData.meta).totalCount ??
        0,
    );

    return NextResponse.json(
      {
        ok: true,
        activePlayers,
        totalPlayers,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    logger.error('Error fetching Dune server telemetry', { error });

    return NextResponse.json(
      {
        ok: false,
        activePlayers: null,
        totalPlayers: null,
        error: 'Unable to load Dune server telemetry.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
