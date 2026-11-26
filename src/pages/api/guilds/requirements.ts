import { runPagesApiHandler } from '../../../server/pages-api';
import { LIST as GET } from '../../../features/guilds/server/requirements';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
