import type { GetServerSideProps } from 'next';
import ClerkSignInPage from '../modules/auth/components/ClerkSignInPage';

export const getServerSideProps: GetServerSideProps<{ publishableKey: string }> = async ({ res }) => {
  const { getServerEnv, isClerkAuthEnabled } = await import('../config/env');
  // Discord mode keeps its own OAuth callback; this page exists only while Clerk is configured.
  if (!isClerkAuthEnabled()) return { notFound: true };
  res.setHeader('Cache-Control', 'private, no-store');
  return { props: { publishableKey: getServerEnv().NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY! } };
};

export default ClerkSignInPage;
