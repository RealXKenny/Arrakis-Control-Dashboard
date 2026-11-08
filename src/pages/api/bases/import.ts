import { runPagesApiHandler } from '../../../server/pages-api';
import { POST } from '../../../features/bases/server/import';
export const config = { api: { bodyParser: { sizeLimit: '600kb' } } };
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'POST', POST);
}
