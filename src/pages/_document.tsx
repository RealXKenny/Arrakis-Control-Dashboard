import Document, { Head, Html, Main, NextScript } from "next/document";

export const metadata = {
  title: "Arrakis Control Dashboard",
  description: "Modular Discord bot interface for the Dune: Awakening Console",
};

export default class RootDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="referrer" content="same-origin" />
          <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        </Head>
        <body
          style={{
            backgroundColor: "#120a06",
            color: "#f3d39b",
            margin: 0,
            padding: 0,
          }}
        >
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
