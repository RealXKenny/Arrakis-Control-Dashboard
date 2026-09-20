import { runPagesApiHandler } from '../../infrastructure/pages-api';
import { GET } from '../../modules/changelog/server/handler';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
