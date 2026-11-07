import { runPagesApiHandler } from '../../../../../infrastructure/pages-api';
import { ADMIN_GET as GET } from '../../../../../modules/guilds/server/support';
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
