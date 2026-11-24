import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <section
        className="hero flex items-center gap-16 px-16 py-24 bg-[#fafafa] tablet:gap-8 tablet:px-8 tablet:py-16 mobile:flex-col mobile:gap-6 mobile:px-4 mobile:py-12"
      >
        <div
          className="copy flex flex-col gap-6 flex-1 mobile:items-center mobile:flex-initial mobile:self-stretch"
        >
          <h1
            className="title text-7xl font-bold leading-[1.1] tracking-tight tablet:text-5xl mobile:text-4xl mobile:text-center"
          >
            Ship sites people remember
          </h1>
          <p className="lede max-w-140 text-xl text-[#52525b] mobile:text-lg">
            Design on a canvas. Get real code.
          </p>
        </div>
        <Image
          src="/assets/hero-art.png"
          alt="A canvas with frames for desktop, tablet and mobile"
          width={1440}
          height={1080}
          className="hero-art flex-none w-120 h-90 rounded-3xl mobile:self-stretch mobile:w-auto mobile:h-60 object-cover"
        />
      </section>
    </main>
  );
}
