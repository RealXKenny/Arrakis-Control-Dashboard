import type { Metadata, Viewport } from 'next';
import { Archivo, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { navIdentity } from '../features/auth/identity';
import { getServerEnv } from '../lib/env';
import { currentSession } from '../server/session';
import { SiteFooter } from './_components/site-footer';
import { TopNavigation } from './_components/top-navigation';
import './globals.css';

// Archivo's width axis gives the monolithic, wide-set headline voice; Mono carries data and labels.
const sans = Archivo({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  axes: ['wdth'],
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

// APP_URL is a runtime variable, so this layout must never be prerendered at build time.
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Command your Dune: Awakening holdings: live map, CHOAM market, vehicle access, and a community base marketplace.';

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
    },
    twitter: { card: 'summary_large_image' },
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
        <TopNavigation identity={session ? navIdentity(session) : null} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
