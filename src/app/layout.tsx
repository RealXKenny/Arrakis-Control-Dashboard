import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { navIdentity } from '../features/auth/identity';
import { getServerEnv } from '../config/env';
import { currentSession } from '../features/auth/server/session';
import { isDashboardAdmin } from '../features/admin/server/access';
import { SiteFooter } from '../components/layout/site-footer';
import { TopNavigation } from '../components/navigation/top-navigation';
import '../styles/globals.css';

// Archivo's width axis gives the monolithic, wide-set headline voice; Mono carries data and labels.
const sans = localFont({
  src: '../assets/fonts/archivo-variable.ttf',
  weight: '100 900',
  style: 'normal',
  variable: '--font-sans',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
});
const mono = localFont({
  src: '../assets/fonts/jetbrains-mono-variable.ttf',
  weight: '100 800',
  style: 'normal',
  variable: '--font-mono',
  display: 'swap',
});

// APP_URL is a runtime variable, so this layout must never be prerendered at build time.
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'A community dashboard for Dune: Awakening servers: maps, your character and holdings, guilds, a base marketplace and more.';

export function generateMetadata(): Metadata {
  const appUrl = getServerEnv().APP_URL;
  return {
    metadataBase: appUrl ? new URL(appUrl) : undefined,
    title: { default: 'Arrakis Control', template: '%s | Arrakis Control' },
    description: DESCRIPTION,
    applicationName: 'Arrakis Control Dashboard',
    openGraph: {
      type: 'website',
      siteName: 'Arrakis Control Dashboard',
      title: 'Arrakis Control',
      description: DESCRIPTION,
      images: [{ url: '/api/assets/share/preview-v1.png', width: 1200, height: 630, alt: 'Arrakis Control' }],
    },
    twitter: { card: 'summary_large_image', images: ['/api/assets/share/preview-v1.png'] },
  };
}

export const viewport: Viewport = {
  themeColor: '#09090b',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // A storage hiccup must not take the public pages down: fall back to the signed-out navigation.
  const session = await currentSession().catch(() => null);
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${sans.variable} ${mono.variable} dark`}>
      <body className="flex min-h-dvh flex-col bg-obsidian-950 text-sand-200 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-spice-500 focus:px-4 focus:py-2 focus:text-xs focus:font-bold focus:uppercase focus:tracking-[0.2em] focus:text-obsidian-950"
        >
          Skip to content
        </a>
        <TopNavigation identity={session ? navIdentity(session) : null} isAdmin={isDashboardAdmin(session)} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
