import { route } from '../../../../../server/http';
import { getPlan, postPlan } from '../../../../../features/expeditions/server/http';

export const dynamic = 'force-dynamic';
export const GET = route(getPlan);
export const POST = route(postPlan);
