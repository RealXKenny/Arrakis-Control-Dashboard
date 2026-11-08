import '../../../lib/assert-server';
import { NextResponse } from '../../../server/pages-api';
import { readChangelog } from './read';

export async function GET() {
  return NextResponse.json(
    { ok: true, releases: await readChangelog() },
    { status: 200, headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
