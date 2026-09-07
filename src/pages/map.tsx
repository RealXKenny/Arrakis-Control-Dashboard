import type { GetServerSideProps } from 'next';

// Preserve old map bookmarks while keeping the atlas inside the portal.
export const getServerSideProps: GetServerSideProps = async ({ query }) => ({
  redirect: { destination: `/portal?view=${query.map === 'DeepDesert' ? 'deep-desert' : 'hagga'}`, permanent: false },
});
export default function LegacyMap() {
  return null;
}
