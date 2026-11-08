import { runPagesApiHandler } from '../../../server/pages-api';
import { detail as GET } from '../../../features/bases/marketplace/server/read';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
