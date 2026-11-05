import { runPagesApiHandler } from '../../../../infrastructure/pages-api';
import { GET } from '../../../../modules/auth/server/clerk-complete';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
