import { route } from '../../../../server/http';
import { getPrivacy, putPrivacy } from '../../../../features/privacy/server/http';
export const GET = route(getPrivacy);
export const POST = route(putPrivacy);
