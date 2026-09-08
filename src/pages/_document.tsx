import Document, { Head, Html, Main, NextScript } from 'next/document';

export default class RootDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          <meta charSet="utf-8" />
          <meta name="referrer" content="same-origin" />
          <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
