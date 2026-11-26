import { roadmapApi } from '../../../../features/roadmap/server/http';
import { route } from '../../../../server/http';

export const dynamic = 'force-dynamic';
export const GET = route(roadmapApi);
