import { runPagesApiHandler } from '../../../../../../../infrastructure/pages-api';
import { MESSAGES as GET } from '../../../../../../../modules/admin/server/guilds';
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
