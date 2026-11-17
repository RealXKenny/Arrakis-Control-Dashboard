import { route } from '../../../../../../../server/http';
import { mutateSubmission } from '../../../../../../../features/events/server/submissions-http';

export const dynamic = 'force-dynamic';
export const POST = route(mutateSubmission);
