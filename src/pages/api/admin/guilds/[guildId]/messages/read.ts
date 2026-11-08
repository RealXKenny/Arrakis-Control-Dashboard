import { runPagesApiHandler } from '../../../../../../server/pages-api';
import { ADMIN_READ as POST } from '../../../../../../features/guilds/server/support';
export const config = { api: { bodyParser: { sizeLimit: '64kb' } } };
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'POST', POST);
}
