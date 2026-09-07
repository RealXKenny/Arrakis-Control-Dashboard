import { runPagesApiHandler } from '../../../../infrastructure/pages-api';
import { POST } from '../../../../modules/auth/server/logout';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'POST', POST);
}
