import { route } from '../../../../../../server/http';
import { mutateCase } from '../../../../../../features/moderation/server/http';

export const dynamic = 'force-dynamic';
export const POST = route(mutateCase);
