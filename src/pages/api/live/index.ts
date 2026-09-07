import { runPagesApiHandler } from '../../../infrastructure/pages-api';
import { GET } from '../../../modules/live/server/route';
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
