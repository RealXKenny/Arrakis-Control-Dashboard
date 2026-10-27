import { runPagesApiHandler } from '../../../../infrastructure/pages-api';
import { POST } from '../../../../modules/marketplace/server/publish';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'POST', POST);
}
