import { route } from '../../../../../../../server/http';
import { getArtwork } from '../../../../../../../features/seasons/server/artwork';
export const dynamic = 'force-dynamic';
export const GET = route(getArtwork);
