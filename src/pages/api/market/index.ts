import { runPagesApiHandler } from '../../../server/pages-api';
import { GET } from '../../../features/market/server/market';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
