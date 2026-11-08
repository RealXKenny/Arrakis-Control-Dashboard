import { runPagesApiHandler } from '../../../server/pages-api';
import { GET } from '../../../features/guilds/server/application-status';
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
