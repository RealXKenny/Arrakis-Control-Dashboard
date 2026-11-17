import { runPagesApiHandler } from '../../../../../server/pages-api';
import { REMOVE as DELETE } from '../../../../../features/guilds/server/membership';
export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'DELETE', DELETE);
}
