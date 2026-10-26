import type { GetServerSideProps } from 'next';
export { default } from '../modules/admin/components/AdminWorkspace';

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const { requireDashboardAdmin } = await import('../modules/admin/server/access');
  const { AppError } = await import('../lib/errors');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  try {
    const session = await requireDashboardAdmin(req, res);
    return { props: { accountName: session.user.global_name ?? session.user.username ?? 'Administrator' } };
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401)
      return { redirect: { destination: '/auth/login', permanent: false } };
    if (error instanceof AppError && error.statusCode === 403) return { notFound: true };
    throw error;
  }
};
