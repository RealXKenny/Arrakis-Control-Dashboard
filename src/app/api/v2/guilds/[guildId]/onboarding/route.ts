import { route } from '../../../../../../server/http';
import { getGuildOnboarding, mutateGuildOnboarding } from '../../../../../../features/guilds/server/onboarding-http';

export const dynamic = 'force-dynamic';
export const GET = route(getGuildOnboarding);
export const POST = route(mutateGuildOnboarding);
