export { default } from '../modules/portal/components/PortalPage';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const { getShareProps } = await import('../modules/sharing/server/config');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return { props: getShareProps() };
};
