import '../styles/global.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import Head from 'next/head';
import Script from 'next/script';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import SharePreview from '../modules/sharing/SharePreview';

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
          key="description"
          content="Crimson Skies: your Dune: Awakening character, holdings, live map and CHOAM market."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <SharePreview origin={pageProps.shareOrigin} />
      <Component {...pageProps} />
      <Script
        src="https://announcify.app/widget.js"
        data-project-id="cmvsu06fg00001v0xfjofkwxp"
        data-api-base="https://announcify.app"
        strategy="afterInteractive"
      />
    </>
  );
}
