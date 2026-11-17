import { route } from '../../../../../../server/http';
import { createSubmission, getSubmissions } from '../../../../../../features/events/server/submissions-http';

export const dynamic = 'force-dynamic';
export const GET = route(getSubmissions);
export const POST = route(createSubmission);
