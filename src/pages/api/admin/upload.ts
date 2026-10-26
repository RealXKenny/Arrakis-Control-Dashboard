import { runPagesApiHandler } from '../../../infrastructure/pages-api';
import { POST } from '../../../modules/admin/server/upload';

export const config = { api: { bodyParser: false, responseLimit: '4mb' } };

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'POST', POST);
}
