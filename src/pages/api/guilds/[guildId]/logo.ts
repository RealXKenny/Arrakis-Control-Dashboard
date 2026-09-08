import { runPagesApiHandler } from '../../../../infrastructure/pages-api';
import { GET, POST } from '../../../../modules/guilds/server/logo';

export default function handler(req, res) {
  if (req.method === 'POST') return runPagesApiHandler(req, res, 'POST', POST);
  return runPagesApiHandler(req, res, 'GET', GET);
}
