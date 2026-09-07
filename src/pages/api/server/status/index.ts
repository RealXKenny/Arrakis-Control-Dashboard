import { runPagesApiHandler } from "../../../../infrastructure/pages-api";
import { GET } from "../../../../modules/home/server/status";

export default function handler(req, res) {
  return runPagesApiHandler(req, res, "GET", GET);
}
