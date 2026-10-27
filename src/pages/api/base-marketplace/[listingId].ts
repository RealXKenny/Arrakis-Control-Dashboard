import { runPagesApiHandler } from '../../../infrastructure/pages-api';
import { detail as GET } from '../../../modules/marketplace/server/read';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
