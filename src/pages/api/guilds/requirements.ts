import { runPagesApiHandler } from '../../../infrastructure/pages-api';
import { LIST as GET } from '../../../modules/guilds/server/requirements';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
