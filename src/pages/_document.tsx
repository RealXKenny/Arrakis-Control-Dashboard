import Document, { Head, Html, Main, NextScript, type DocumentContext, type DocumentInitialProps } from 'next/document';

type RootDocumentProps = DocumentInitialProps & { nonce?: string };

export default class RootDocument extends Document<RootDocumentProps> {
  static async getInitialProps(ctx: DocumentContext): Promise<RootDocumentProps> {
    const initialProps = await Document.getInitialProps(ctx);
    // The proxy issues one base64 nonce per request; anything else is ignored.
    const header = ctx.req?.headers?.['x-nonce'];
    const nonce = typeof header === 'string' && /^[A-Za-z0-9+/]{22}==$/.test(header) ? header : undefined;
    return { ...initialProps, nonce };
  }

  render() {
    const { nonce } = this.props;
    return (
      <Html lang="en" data-theme="default">
        <Head nonce={nonce}>
          <meta charSet="utf-8" />
          <meta name="referrer" content="same-origin" />
          <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
          {/* Intentional parser blocking: select local colors before any body can paint under the strict CSP. */}
          {/* eslint-disable-next-line @next/next/no-sync-scripts */}
          <script src="/api/theme-script" nonce={nonce} />
        </Head>
        <body>
          <Main />
          <NextScript nonce={nonce} />
        </body>
      </Html>
    );
  }
}
