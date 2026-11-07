import { runPagesApiHandler } from '../../../../../../infrastructure/pages-api';
import { ADMIN_POST as POST } from '../../../../../../modules/guilds/server/support';
export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'POST', POST);
}
