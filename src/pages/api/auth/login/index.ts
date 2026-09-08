import { runPagesApiHandler } from '../../../../infrastructure/pages-api';
import { GET } from '../../../../modules/auth/server/login';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
