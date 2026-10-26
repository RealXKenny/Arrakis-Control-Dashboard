import { runPagesApiHandler } from '../../../../infrastructure/pages-api';
import { GET } from '../../../../modules/bot/server/world';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
