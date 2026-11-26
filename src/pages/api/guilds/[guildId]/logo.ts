import { runPagesApiHandler } from '../../../../server/pages-api';
import { GET, POST } from '../../../../features/guilds/server/logo';

export default function handler(req, res) {
  if (req.method === 'POST') return runPagesApiHandler(req, res, 'POST', POST);
  return runPagesApiHandler(req, res, 'GET', GET);
}
