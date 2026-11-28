import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <figure className="map self-stretch aspect-video">
        <iframe
          src="https://www.openstreetmap.org/export/embed.html"
          title="Map"
          loading="lazy"
          className="block size-full border-0"
        />
      </figure>
      <div className="embed flex-none h-30">
        <iframe
          src="https://example.com/widget"
          title="Embedded content"
          loading="lazy"
          className="block size-full border-0"
        />
      </div>
      <section className="snippet flex-none h-20">
        <iframe
          srcDoc={"<script>alert(1)</script>"}
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          title="Snippet"
          loading="lazy"
          className="block size-full border-0"
        />
      </section>
      <div className="icons flex gap-2">
        <span
          className="star flex-none w-6 h-6 text-[#f59e0b]"
          aria-hidden="true"
        >
          <img
            src="https://api.iconify.design/lucide/star.svg"
            alt=""
            className="block size-full"
          />
        </span>
        <span
          className="heart flex-none w-6 h-6 text-[#f59e0b]"
          aria-hidden="true"
        >
          <img
            src="https://api.iconify.design/lucide/heart.svg"
            alt=""
            className="block size-full"
          />
        </span>
        <span
          className="check flex-none w-6 h-6 text-[#f59e0b]"
          aria-hidden="true"
        >
          <img
            src="https://api.iconify.design/lucide/check.svg"
            alt=""
            className="block size-full"
          />
        </span>
      </div>
    </main>
  );
}
