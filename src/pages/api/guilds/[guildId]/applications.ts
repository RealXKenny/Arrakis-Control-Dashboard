import { runPagesApiHandler } from '../../../../server/pages-api';
import { LIST as GET, REVIEW as POST } from '../../../../features/guilds/server/applications';

export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };
export default function handler(req, res) {
  if (req.method === 'POST') return runPagesApiHandler(req, res, 'POST', POST);
  return runPagesApiHandler(req, res, 'GET', GET);
}
