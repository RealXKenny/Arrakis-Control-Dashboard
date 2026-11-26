import { route } from '../../../../../server/http';
import { getOwnRescue, postRescue } from '../../../../../features/expeditions/server/http';

export const dynamic = 'force-dynamic';
export const GET = route(getOwnRescue);
export const POST = route(postRescue);
