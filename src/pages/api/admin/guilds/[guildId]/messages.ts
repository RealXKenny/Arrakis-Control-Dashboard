import { runPagesApiHandler } from '../../../../../server/pages-api';
import { ADMIN_GET as GET } from '../../../../../features/guilds/server/support';
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
