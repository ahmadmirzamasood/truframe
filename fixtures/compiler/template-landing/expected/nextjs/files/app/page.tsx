import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <section
        className="hero flex flex-col items-center gap-6 px-8 py-24 flex-none self-stretch h-fit mobile:gap-4 mobile:px-5 mobile:py-14"
      >
        <h1
          className="text text-[56px] font-bold text-center text-(color:--neutral-ink) mobile:text-4xl"
        >
          Launch something people love
        </h1>
        <p className="text-el-2 text-lg text-center text-(color:--neutral-ink)">
          One sentence on what you do and who it is for.
        </p>
        <a
          href="#signup"
          className="button flex px-6 py-3 bg-(--brand-accent) rounded-lg"
        >
          <span className="label font-semibold text-[#ffffff]">
            Get started
          </span>
        </a>
      </section>
      <section
        className="features flex flex-col items-center gap-6 px-8 py-24 flex-none self-stretch h-fit mobile:gap-4 mobile:px-5 mobile:py-14"
      >
        <h2
          className="text-el-3 text-4xl font-bold text-center text-(color:--neutral-ink) mobile:text-[28px]"
        >
          Why it works
        </h2>
        <p className="text-el-4 text-lg text-center text-(color:--neutral-ink)">
          Three short reasons, each with a heading.
        </p>
      </section>
      <section
        className="call-to-action flex flex-col items-center gap-6 px-8 py-24 flex-none self-stretch h-fit mobile:gap-4 mobile:px-5 mobile:py-14"
      >
        <a
          href="#signup"
          className="button-2 flex px-6 py-3 bg-(--brand-accent) rounded-lg"
        >
          <span className="label-2 font-semibold text-[#ffffff]">
            Start free
          </span>
        </a>
      </section>
    </main>
  );
}
