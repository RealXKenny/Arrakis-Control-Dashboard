import '../../../lib/assert-server';
import { loadPublicSiteConfig } from '../../../config/public-site-server';
import { NextResponse } from '../../../infrastructure/pages-api';

export async function GET() {
  return NextResponse.json(
    { ok: true, data: await loadPublicSiteConfig() },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
}
