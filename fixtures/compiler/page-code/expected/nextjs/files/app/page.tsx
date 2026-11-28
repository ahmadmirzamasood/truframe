import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <>
      <Script
        id="tf-home-head-1"
        strategy="afterInteractive"
        data-domain="example.com"
        src="https://plausible.io/js/script.js"
      />
      <meta name="google-site-verification" content="abc123" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: "{\"@context\":\"https://schema.org\",\"@type\":\"Organization\",\"name\":\"Acme \\\"Q\\\"\"}" }}
      />
      <main className="body flex flex-col w-full h-fit">
        <h1 className="title">Page code</h1>
      </main>
      <Script
        id="tf-home-body-1"
        strategy="lazyOnload"
        dangerouslySetInnerHTML={{ __html: "window.tfLoaded = true;" }}
      />
      <noscript
        dangerouslySetInnerHTML={{ __html: "<img src=\"https://px.example.com/1.gif\" alt=\"\">" }}
      />
    </>
  );
}
