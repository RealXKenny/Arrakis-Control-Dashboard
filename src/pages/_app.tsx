import '../styles/global.css';
import '@fontsource/saira/400.css';
import '@fontsource/saira/500.css';
import '@fontsource/saira-condensed/600.css';
import '@fontsource/saira-condensed/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function App({ Component, pageProps }) {
  const router = useRouter();
  useEffect(() => {
    // Keep query overrides current during shallow navigation as well as full page loads.
    const refresh = () => window.dispatchEvent(new Event('theme-route-change'));
    router.events.on('routeChangeComplete', refresh);
    return () => router.events.off('routeChangeComplete', refresh);
  }, [router.events]);
  return (
    <>
      <Head>
        <title>Arrakis Control Dashboard</title>
        <meta
          name="description"
          content="Crimson Skies: your Dune: Awakening character, holdings, live map and CHOAM market."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
