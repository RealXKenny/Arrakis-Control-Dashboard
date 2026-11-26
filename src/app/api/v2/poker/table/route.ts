import { getTable, postTableAction } from '../../../../../features/poker/server/handlers';
import { route } from '../../../../../server/http';

export const GET = route(getTable);
export const POST = route(postTableAction);
