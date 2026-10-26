import { NextResponse } from '../../../infrastructure/pages-api';
import { getThemeScript } from '../bootstrap';

/** Public configuration only; the common boundary retains method and security checks. */
export function GET() {
  return new NextResponse(getThemeScript(), {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
  });
}
