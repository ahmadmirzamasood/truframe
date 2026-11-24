import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
};

export default function PricingPage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <section
        className="pricing flex flex-col items-center gap-6 px-8 py-24 flex-none self-stretch h-fit mobile:gap-4 mobile:px-5 mobile:py-14"
      >
        <h1
          className="text text-[56px] font-bold text-center text-(color:--neutral-ink) mobile:text-4xl"
        >
          Pricing
        </h1>
        <h2
          className="text-el-2 text-4xl font-bold text-center text-(color:--neutral-ink) mobile:text-[28px]"
        >
          Starter
        </h2>
        <h2
          className="text-el-3 text-4xl font-bold text-center text-(color:--neutral-ink) mobile:text-[28px]"
        >
          Pro
        </h2>
        <h2
          className="text-el-4 text-4xl font-bold text-center text-(color:--neutral-ink) mobile:text-[28px]"
        >
          Business
        </h2>
      </section>
    </main>
  );
}
