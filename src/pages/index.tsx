import type { GetServerSideProps } from 'next';
import LandingPage from '../modules/home/components/LandingPage';

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  // Dev note: sessions stay server-side; the browser has enough secrets already.
  const { getSession } = await import('../lib/session-store');
  const { getRequestCookie } = await import('../infrastructure/cookies');
  const sessionId = getRequestCookie(req, 'dashboard_session');
  const session = sessionId ? await getSession(sessionId) : null;
  const { isDashboardAdmin } = await import('../modules/admin/server/access');

  return {
    props: {
      isAuthenticated: Boolean(sessionId && session && session.expiresAt > Date.now()),
      isAdmin: isDashboardAdmin(session),
    },
  };
};

export default LandingPage;
