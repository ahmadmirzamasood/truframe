import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <article
        className="story flex flex-col gap-3 font-(family-name:--tf-font-inter)"
      >
        <h1
          className="headline font-(family-name:--tf-font-playfair-display) text-5xl font-bold"
        >
          Editorial headline
        </h1>
        <h2
          className="subhead font-(family-name:--tf-font-playfair-display) text-2xl font-normal"
        >
          With a serif subhead
        </h2>
        <p className="body-2 text-base">
          Body copy inherits Inter from its section.
        </p>
        <span className="strong font-semibold">Semibold label</span>
        <p className="system font-(family-name:--tf-font-georgia)">
          Georgia is a system font.
        </p>
      </article>
    </main>
  );
}
