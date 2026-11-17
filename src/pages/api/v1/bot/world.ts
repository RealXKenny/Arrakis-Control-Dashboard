import { runPagesApiHandler } from '../../../../server/pages-api';
import { GET } from '../../../../features/bot/server/world';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
