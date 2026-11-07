import { runPagesApiHandler } from '../../../../../infrastructure/pages-api';
import { STATUS as GET } from '../../../../../modules/guilds/server/support';
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
