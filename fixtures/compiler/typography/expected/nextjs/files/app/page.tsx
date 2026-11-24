import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <article className="article flex flex-col gap-4 p-12">
        <h1 className="heading-1 text-6xl">Heading level 1</h1>
        <h2 className="heading-2 text-5xl">Heading level 2</h2>
        <h3 className="heading-3 text-4xl">Heading level 3</h3>
        <h4 className="heading-4 text-3xl">Heading level 4</h4>
        <h5 className="heading-5 text-2xl">Heading level 5</h5>
        <h6 className="heading-6 text-xl">Heading level 6</h6>
        <p className="rich text-lg leading-relaxed text-justify">
          Plain, <strong>bold</strong>, <em>italic</em>, <u>underlined</u>, <strong><em><u>all three</u></em></strong> and <a href="https://example.com/docs">a link</a>.<br />A second line.
        </p>
        <blockquote
          className="quote text-2xl tracking-widest no-underline uppercase"
        >
          Simplicity is the ultimate sophistication.
        </blockquote>
        <span className="fine-print text-xs text-[#71717a]">
          Prices exclude tax.
        </span>
      </article>
    </main>
  );
}
