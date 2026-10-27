import '../../../lib/assert-server';
import { NextResponse } from '../../../infrastructure/pages-api';
import { AppError } from '../../../lib/errors';
import { requireOwnedBaseExport } from '../../bases/server/owned-export';

export async function GET(request, res) {
  try {
    const { blueprint } = await requireOwnedBaseExport(request, res);
    return new NextResponse(JSON.stringify(blueprint, null, 2), {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="base-${String(request.query.baseId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json"`,
      },
    });
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json({ ok: false, error: error.message }, { status: error.statusCode });
    return NextResponse.json({ ok: false, error: 'Unable to export base' }, { status: 502 });
  }
}
