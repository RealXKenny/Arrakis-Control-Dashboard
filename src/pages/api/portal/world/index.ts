import { runPagesApiHandler } from '../../../../server/pages-api';
import { GET } from '../../../../features/portal/server/world';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
