import { runPagesApiHandler } from '../../../infrastructure/pages-api';
import { POST } from '../../../modules/admin/server/execute';

export const config = { api: { bodyParser: { sizeLimit: '128kb' }, responseLimit: false } };

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'POST', POST);
}
