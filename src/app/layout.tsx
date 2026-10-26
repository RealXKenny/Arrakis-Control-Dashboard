import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Topbar from '../components/Topbar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arrakis Control Dashboard',
  description: 'Crimson Skies: your Dune: Awakening character, holdings, live map and CHOAM market.',
};

export const viewport: Viewport = {
  themeColor: '#09090b',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-ink font-sans text-zinc-200 antialiased">
        <a
          href="#dashboard-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:border focus:border-accent focus:bg-panel focus:px-4 focus:py-2 focus:text-sm focus:text-zinc-100"
        >
          Skip to content
        </a>
        <Topbar />
        <main id="dashboard-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-edge">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-zinc-600 sm:px-6">
            <span>Arrakis Control Dashboard</span>
            <span>Your community. Connected.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
