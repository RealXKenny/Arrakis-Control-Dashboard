import '../../lib/assert-server';
import { runPagesApiHandler } from '../../infrastructure/pages-api';
import { GET } from '../../modules/auth/server/session';
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
