import "../styles/global.css";
import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Arrakis Control Dashboard</title>
        <meta name="description" content="Modular Discord bot interface for the Dune: Awakening Console" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
