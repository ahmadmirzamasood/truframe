import type { Metadata } from "next";
import Script from "next/script";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <>
      <Script
        id="tf-home-head-1"
        strategy="afterInteractive"
        src="https://analytics.example.com/a.js"
      />
      <main className="body flex flex-col w-full h-fit">
        <section
          className="hero flex gap-(--spacing-md) pt-2 pr-2 pb-(--spacing-md) pl-2 relative bg-(--colors-brand) tablet:hidden tablet:items-stretch tablet:justify-between tablet:grid-cols-2 tablet:grid-rows-3 tablet:gap-y-3 tablet:flex-none tablet:h-160 tablet:min-w-25 tablet:max-w-250 tablet:min-h-2.5 tablet:max-h-225 tablet:overflow-clip tablet:bg-transparent tablet:bg-[linear-gradient(45deg,#000000_0%,var(--colors-brand)_100%)] tablet:border-0 tablet:border-t tablet:border-b tablet:border-dashed tablet:border-[#11223344] tablet:rounded-tl-sm tablet:rounded-tr-lg tablet:rounded-br-none tablet:rounded-bl-[2.5px] tablet:shadow-[0px_4px_12px_-2px_var(--colors-brand)] tablet:opacity-90 tablet:mix-blend-color-dodge tablet:blur-[2px]"
        >
          <h1
            className="text font-(family-name:--tf-font-inter) text-5xl font-bold leading-[1.1] tracking-[-0.02em] text-center line-through uppercase truncate text-[#111111]"
          >
            Hello <strong>world</strong><a href="https://example.com"><em><u>!</u></em></a>
          </h1>
          <Image
            src="/assets/photo.png"
            alt="A photo"
            width={800}
            height={600}
            className="image object-cover"
          />
          <Link href="/about" className="cta">
            <span className="text-el-2">About</span>
          </Link>
          <div className="card p-8 card-2">
            <h3 className="card__title tablet:text-[#ffffff] mobile:hidden">
              Overridden
            </h3>
          </div>
          <span
            className="arrow absolute -top-1 right-0 bottom-0 left-2.5 z-2 w-6 aspect-square tablet:col-span-2 tablet:row-span-1"
            aria-hidden="true"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="block size-full"
            >
              <g
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              >
                <path d="M5 12h14m-7-7l7 7l-7 7" />
              </g>
            </svg>
          </span>
          <figure className="map bg-[url(/assets/photo.png)] bg-auto bg-repeat">
            <iframe
              src="https://maps.example.com/embed?q=1"
              title="Map"
              loading="lazy"
              className="block size-full border-0"
            />
          </figure>
          <div className="widget">
            <iframe
              srcDoc={"<div class=\"w\">Hi</div>"}
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              title="Widget"
              loading="lazy"
              className="block size-full border-0"
            />
          </div>
          <a
            href="mailto:hi@example.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mail rounded-[999px]"
            aria-label="Email us"
          />
          <div className="placeholder bg-[#e5e5e5]" aria-hidden="true" />
        </section>
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: "{}" }}
      />
    </>
  );
}
