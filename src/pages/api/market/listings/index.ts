import { runPagesApiHandler } from '../../../../infrastructure/pages-api';
import { GET } from '../../../../modules/portal/server/market-listings';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
