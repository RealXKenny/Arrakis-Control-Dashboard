import { runPagesApiHandler } from '../../../../server/pages-api';
import { GET } from '../../../../features/server-status/server/status';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
