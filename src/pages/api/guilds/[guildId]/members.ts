import { runPagesApiHandler } from '../../../../infrastructure/pages-api';
import { GET } from '../../../../modules/guilds/server/members';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
