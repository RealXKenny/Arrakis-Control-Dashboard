import { runPagesApiHandler } from '../../../../../infrastructure/pages-api';
import { READ as POST } from '../../../../../modules/guilds/server/support';
export const config = { api: { bodyParser: { sizeLimit: '64kb' } } };
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'POST', POST);
}
