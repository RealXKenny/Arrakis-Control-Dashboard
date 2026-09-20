import type { GetServerSideProps } from 'next';
import LandingPage from '../modules/home/components/LandingPage';

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  // Dev note: sessions stay server-side; the browser has enough secrets already.
  const { getSession } = await import('../lib/session-store');
  const { getRequestCookie } = await import('../infrastructure/cookies');
  const sessionId = getRequestCookie(req, 'dashboard_session');
  const session = sessionId ? await getSession(sessionId) : null;

  return {
    props: {
      isAuthenticated: Boolean(sessionId && session && session.expiresAt > Date.now()),
    },
  };
};

export default LandingPage;
