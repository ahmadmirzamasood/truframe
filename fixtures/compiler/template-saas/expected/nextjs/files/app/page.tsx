import type { Metadata } from "next";
import Link from "next/link";

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
          The simplest way to run your team
        </h1>
        <Link
          href="/pricing"
          className="button flex px-6 py-3 bg-(--brand-accent) rounded-lg"
        >
          <span className="label font-semibold text-[#ffffff]">
            Start a free trial
          </span>
        </Link>
      </section>
      <section
        className="logos flex flex-col items-center gap-6 px-8 py-24 flex-none self-stretch h-fit mobile:gap-4 mobile:px-5 mobile:py-14"
      >
        <p className="text-el-2 text-lg text-center text-(color:--neutral-ink)">
          Trusted by teams at
        </p>
      </section>
    </main>
  );
}
