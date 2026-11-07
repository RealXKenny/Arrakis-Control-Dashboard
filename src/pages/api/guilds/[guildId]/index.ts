import { runPagesApiHandler } from '../../../../infrastructure/pages-api';
import { DISBAND as DELETE } from '../../../../modules/guilds/server/membership';
export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };
export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'DELETE', DELETE);
}
