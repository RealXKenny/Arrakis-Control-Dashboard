import { runPagesApiHandler } from '../../../../../infrastructure/pages-api';
import { GET } from '../../../../../modules/admin/server/guilds';
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
