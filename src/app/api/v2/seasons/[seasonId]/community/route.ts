import { route } from '../../../../../../server/http';
import { getCommunityProgress } from '../../../../../../features/seasons/server/community';
export const dynamic = 'force-dynamic';
export const GET = route(getCommunityProgress);
