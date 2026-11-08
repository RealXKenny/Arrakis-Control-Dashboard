import { runPagesApiHandler } from '../../../../../server/pages-api';
import { GET } from '../../../../../features/admin/server/guilds';
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
