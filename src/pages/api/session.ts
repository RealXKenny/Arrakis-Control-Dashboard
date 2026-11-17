import '../../lib/assert-server';
import { runPagesApiHandler } from '../../server/pages-api';
import { GET } from '../../features/auth/server/session-api';
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
