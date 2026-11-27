import { route } from '../../../../../server/http';
import { releaseSignal } from '../../../../../features/updates/server/release-signal';

export const GET = route((request) => releaseSignal(request));
