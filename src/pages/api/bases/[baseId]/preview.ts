import { runPagesApiHandler } from '../../../../server/pages-api';
import { GET, POST } from '../../../../features/bases/server/preview-settings';

export const config = { api: { bodyParser: { sizeLimit: '1500kb' } } };

export default function handler(req, res) {
  if (req.method === 'POST') return runPagesApiHandler(req, res, 'POST', POST);
  return runPagesApiHandler(req, res, 'GET', GET);
}
