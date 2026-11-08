import { runPagesApiHandler } from '../../../../../../../server/pages-api';
import { POST } from '../../../../../../../features/guilds/server/chat';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'POST', POST);
}
