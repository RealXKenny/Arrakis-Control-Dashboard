import { runPagesApiHandler } from '../../../../../../server/pages-api';
import { GET } from '../../../../../../features/guilds/server/chat';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
