import type { GetServerSideProps } from 'next';
import LandingPage from '../modules/home/components/LandingPage';

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  // Next.js keeps getServerSideProps in the server bundle; avoid pulling the
  // server session store into the browser page graph.
  const { getSession } = await import('../lib/session-store');
  const sessionId = req.headers.cookie
    ?.split(';')
    .map((entry) => entry.trim().split('='))
    .find(([name]) => name === 'dashboard_session')
    ?.slice(1)
    .join('=');
  const session = sessionId ? await getSession(sessionId) : null;

  return {
    props: {
      isAuthenticated: Boolean(sessionId && session && session.expiresAt > Date.now()),
    },
  };
};

export default LandingPage;
