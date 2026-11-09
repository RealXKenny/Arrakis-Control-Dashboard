import type { Metadata } from 'next';

export { default } from '../features/landing/components/landing-page';

const TITLE = 'Arrakis Control | Dune: Awakening server dashboard';
const DESCRIPTION =
  'A modern command center for Dune: Awakening servers, players, guilds and communities: interactive maps, your character and holdings, guild recruitment, a base marketplace and an audited administration panel.';
const PREVIEW = { url: '/api/assets/share/preview-v1.png', width: 1200, height: 630, alt: 'Arrakis Control' };

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Arrakis Control Dashboard',
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    images: [PREVIEW],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [PREVIEW.url] },
};
