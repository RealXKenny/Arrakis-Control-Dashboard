import { route } from '../../../../../../server/http';
import { uploadArtwork } from '../../../../../../features/seasons/server/artwork';
export const dynamic = 'force-dynamic';
export const POST = route(uploadArtwork);
