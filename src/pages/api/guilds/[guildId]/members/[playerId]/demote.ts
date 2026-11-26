import { runPagesApiHandler } from '../../../../../../server/pages-api';
import { DEMOTE as POST } from '../../../../../../features/guilds/server/membership';
export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'POST', POST);
}
