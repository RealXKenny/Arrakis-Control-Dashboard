import { runPagesApiHandler } from '../../../../../../infrastructure/pages-api';
import { GET } from '../../../../../../modules/guilds/server/chat';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'GET', GET);
}
