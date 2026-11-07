import { runPagesApiHandler } from '../../../../../../infrastructure/pages-api';
import { PROMOTE as POST } from '../../../../../../modules/guilds/server/membership';
export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'POST', POST);
}
