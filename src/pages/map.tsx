import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  // Dev note: old bookmarks still know the way through the desert.
  return {
    redirect: {
      destination: `/portal?view=${query.map === 'DeepDesert' ? 'deep-desert' : 'hagga'}`,
      permanent: false,
    },
  };
};
export default function LegacyMap() {
  return null;
}
