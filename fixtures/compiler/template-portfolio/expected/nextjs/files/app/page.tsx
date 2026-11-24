import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <section
        className="intro flex flex-col items-center gap-6 px-8 py-24 flex-none self-stretch h-fit mobile:gap-4 mobile:px-5 mobile:py-14"
      >
        <h1
          className="text text-[56px] font-bold text-center text-(color:--neutral-ink) mobile:text-4xl"
        >
          Hi, I design and build websites
        </h1>
        <p className="text-el-2 text-lg text-center text-(color:--neutral-ink)">
          A short line about your work.
        </p>
      </section>
      <section
        className="work flex flex-col items-center gap-6 px-8 py-24 flex-none self-stretch h-fit mobile:gap-4 mobile:px-5 mobile:py-14"
      >
        <h2
          className="text-el-3 text-4xl font-bold text-center text-(color:--neutral-ink) mobile:text-[28px]"
        >
          Selected work
        </h2>
        <div
          className="image self-stretch aspect-[1.5] rounded-xl bg-[#e5e5e5]"
          role="img"
          aria-label="Project cover"
        />
        <div
          className="image-2 self-stretch aspect-[1.5] rounded-xl bg-[#e5e5e5]"
          role="img"
          aria-label="Project cover"
        />
      </section>
    </main>
  );
}
