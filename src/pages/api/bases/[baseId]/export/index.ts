import { runPagesApiHandler } from '../../../../../server/pages-api';
import { GET } from '../../../../../features/bases/server/export-base';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
