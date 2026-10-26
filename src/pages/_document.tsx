import Document, { Head, Html, Main, NextScript } from 'next/document';

export default class RootDocument extends Document {
  render() {
    return (
      <Html lang="en" data-theme="default">
        <Head>
          <meta charSet="utf-8" />
          <meta name="referrer" content="same-origin" />
          <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
          {/* Intentional parser blocking: select local colors before any body can paint under the strict CSP. */}
          {/* eslint-disable-next-line @next/next/no-sync-scripts */}
          <script src="/api/theme-script" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
