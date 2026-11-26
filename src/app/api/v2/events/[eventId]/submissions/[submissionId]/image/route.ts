import { route } from '../../../../../../../../server/http';
import { getSubmissionImage } from '../../../../../../../../features/events/server/submissions-http';

export const dynamic = 'force-dynamic';
export const GET = route(getSubmissionImage);
