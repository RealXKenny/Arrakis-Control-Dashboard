import { runPagesApiHandler } from '../../../../server/pages-api';
import { GET, POST } from '../../../../features/guilds/server/applications';

export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };
export default function handler(req, res) {
  if (req.method === 'POST') return runPagesApiHandler(req, res, 'POST', POST);
  return runPagesApiHandler(req, res, 'GET', GET);
}
