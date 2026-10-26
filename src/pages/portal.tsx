export { default } from '../modules/portal/components/PortalPage';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const { getRequestCookie } = await import('../infrastructure/cookies');
  const { getSession } = await import('../lib/session-store');
  const { isDashboardAdmin } = await import('../modules/admin/server/access');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  const id = getRequestCookie(req, 'dashboard_session');
  let isAdmin = false;
  try {
    isAdmin = isDashboardAdmin(id ? await getSession(id) : null);
  } catch {
    /* Fail closed; the client still shows session recovery. */
  }
  return { props: { isAdmin } };
};
