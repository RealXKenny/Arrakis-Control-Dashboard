import { runPagesApiHandler } from '../../../../server/pages-api';
import { POST } from '../../../../features/bases/marketplace/server/publish';

export default function handler(req, res) {
  return runPagesApiHandler(req, res, 'POST', POST);
}
