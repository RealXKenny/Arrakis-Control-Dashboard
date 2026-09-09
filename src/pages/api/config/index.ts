import { runPagesApiHandler } from '../../../infrastructure/pages-api';
import { GET } from '../../../modules/config/server/public';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
