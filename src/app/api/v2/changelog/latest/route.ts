import { route } from '../../../../../server/http';
import { changelogApi } from '../../../../../features/changelog/server/public-api';

export const GET = route((request) => changelogApi(request, true));
