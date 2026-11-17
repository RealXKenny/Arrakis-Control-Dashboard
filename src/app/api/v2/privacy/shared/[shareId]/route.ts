import { route } from '../../../../../../server/http';
import { getSharedPrivacy } from '../../../../../../features/privacy/server/http';
export const GET = route(getSharedPrivacy);
