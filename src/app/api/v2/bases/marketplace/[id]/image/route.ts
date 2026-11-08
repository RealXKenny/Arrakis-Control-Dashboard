import { AppError } from '../../../../../../../lib/errors';
import { getBaseImage } from '../../../../../../../features/bases/server/marketplace';
import { requireApiSession, route } from '../../../../../../../server/http';

type Context = { params: Promise<{ id: string }> };

// Members only, but deliberately outside the read budget: one browse page loads a dozen
// thumbnails, and the URL carries a version so browsers cache them.
export const GET = route(async (_request: Request, { params }: Context) => {
  await requireApiSession();
  const image = await getBaseImage((await params).id);
  if (!image) throw new AppError('Picture not found.', 404, 'NOT_FOUND', true);
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      'Content-Type': image.type,
      'Content-Length': String(image.bytes.length),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
});
