import { runPagesApiHandler } from '../../server/pages-api';
import { GET } from '../../features/changelog/server/handler';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
