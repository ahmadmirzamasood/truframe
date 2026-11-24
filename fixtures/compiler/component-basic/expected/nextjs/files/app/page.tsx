import type { Metadata } from "next";
import PricingCard from "@/components/PricingCard";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <section
        className="pricing flex justify-center gap-6 mobile:flex-col mobile:items-center"
      >
        <PricingCard className="free flex flex-none w-70 mobile:flex-initial" />
        <PricingCard
          className="pro flex flex-1 mobile:flex-initial mobile:self-stretch"
          title="Pro"
          price="$24"
        />
        <PricingCard
          className="pricing-card-2 flex flex-none w-70 mobile:flex-initial"
          title="Team"
          price="$99"
        />
      </section>
    </main>
  );
}
