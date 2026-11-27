import { route } from '../../../../../server/http';
import { releaseWebhook } from '../../../../../features/updates/server/release-signal';

export const POST = route((request) => releaseWebhook(request));
