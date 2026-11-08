import { runPagesApiHandler } from '../../../../../server/pages-api';
import { STATUS as GET } from '../../../../../features/guilds/server/support';
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
