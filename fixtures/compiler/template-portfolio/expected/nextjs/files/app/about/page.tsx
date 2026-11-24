import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <section
        className="about flex flex-col items-center gap-6 px-8 py-24 flex-none self-stretch h-fit mobile:gap-4 mobile:px-5 mobile:py-14"
      >
        <h1
          className="text text-[56px] font-bold text-center text-(color:--neutral-ink) mobile:text-4xl"
        >
          About me
        </h1>
      </section>
    </main>
  );
}
