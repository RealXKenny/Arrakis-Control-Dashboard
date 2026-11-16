import { route } from '../../../../server/http';
import { getTasks, putTasks } from '../../../../features/tasks/server/http';
export const GET = route(getTasks);
export const POST = route(putTasks);
