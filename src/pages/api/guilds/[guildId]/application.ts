import { runPagesApiHandler } from '../../../../infrastructure/pages-api';
import { GET, POST } from '../../../../modules/guilds/server/applications';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };
export default function handler(req, res) {
  if (req.method === 'POST') return runPagesApiHandler(req, res, 'POST', POST);
  return runPagesApiHandler(req, res, 'GET', GET);
}
