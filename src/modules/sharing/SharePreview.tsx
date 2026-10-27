import Head from 'next/head';
import { getShareMetadata, SHARE } from './metadata';

/** Discord crawlers read initial HTML without executing JavaScript. JSON is inert under our CSP. */
export default function SharePreview({ origin }: { origin?: string | null }) {
  const metadata = getShareMetadata(origin);
  if (!metadata) return null;
  return (
    <Head>
      <meta name="description" content={SHARE.description} key="description" />
      <meta name="theme-color" content={SHARE.color} key="theme-color" />
      <meta property="og:site_name" content="Crimson Skies" key="og:site_name" />
      <meta property="og:type" content="website" key="og:type" />
      <meta property="og:title" content={SHARE.title} key="og:title" />
      <meta property="og:description" content={SHARE.description} key="og:description" />
      <meta property="og:url" content={metadata.url} key="og:url" />
      <meta property="og:image" content={metadata.image} key="og:image" />
      <meta property="og:image:type" content="image/png" key="og:image:type" />
      <meta property="og:image:width" content="1200" key="og:image:width" />
      <meta property="og:image:height" content="630" key="og:image:height" />
      <meta
        property="og:image:alt"
        content="Crimson Skies — 3D live maps, base previews and your community workspace."
        key="og:image:alt"
      />
      <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
      <meta name="twitter:title" content={SHARE.title} key="twitter:title" />
      <meta name="twitter:description" content={SHARE.description} key="twitter:description" />
      <meta name="twitter:image" content={metadata.image} key="twitter:image" />
      <meta name="twitter:image:alt" content="Crimson Skies community workspace" key="twitter:image:alt" />
      <script
        id="discord:component-embed"
        type="application/json"
        key="discord:component-embed"
        dangerouslySetInnerHTML={{ __html: metadata.json }}
      />
    </Head>
  );
}
