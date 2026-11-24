import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <section
        className="split flex gap-12 p-20 mobile:flex-col mobile:gap-4 mobile:px-4 mobile:py-6"
      >
        <p className="left text-xl mobile:text-base">
          Tablet overrides stay in the document but are inactive.
        </p>
        <p className="right">Mobile applies below 1200px.</p>
      </section>
    </main>
  );
}
