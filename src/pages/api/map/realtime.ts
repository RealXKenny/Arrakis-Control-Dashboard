import { runPagesApiHandler } from '../../../server/pages-api';
import { GET } from '../../../features/map/server/realtime';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
