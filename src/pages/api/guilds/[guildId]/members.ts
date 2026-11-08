import { runPagesApiHandler } from '../../../../server/pages-api';
import { GET } from '../../../../features/guilds/server/members';
import { ADD as POST } from '../../../../features/guilds/server/membership';

export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };

export default function handler(req, res) {
  if (req.method === 'POST') return runPagesApiHandler(req, res, 'POST', POST);
  return runPagesApiHandler(req, res, 'GET', GET);
}
