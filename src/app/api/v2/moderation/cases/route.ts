import { route } from '../../../../../server/http';
import { getModerationCases } from '../../../../../features/moderation/server/http';

export const dynamic = 'force-dynamic';
export const GET = route(getModerationCases);
