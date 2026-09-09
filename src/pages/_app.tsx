import '../styles/global.css';
import '@fontsource/saira/400.css';
import '@fontsource/saira/500.css';
import '@fontsource/saira-condensed/600.css';
import '@fontsource/saira-condensed/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '../modules/map/markers.css';
import Head from 'next/head';
import { SiteConfigProvider, useSiteConfig } from '../components/SiteConfigProvider';

function ConfiguredApp({ Component, pageProps }) {
  const site = useSiteConfig();
  return (
    <>
      <Head>
        <title>{site.title}</title>
        <meta name="description" content={site.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}

export default function App(props) {
  return (
    <SiteConfigProvider>
      <ConfiguredApp {...props} />
    </SiteConfigProvider>
  );
}
