import type { Metadata } from "next";
import Image from "next/image";
import Feature from "@/components/Feature";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <section className="features grid grid-cols-3 gap-6">
        <Feature className="plain flex" />
        <div
          className="feature flex-col gap-2 p-4 bg-[#fef3c7] rounded-xl fast flex col-span-2"
        >
          <Image
            src="/assets/bolt.svg"
            alt=""
            width={40}
            height={40}
            className="feature__icon flex-none w-10 h-10 object-contain"
          />
          <h3 className="feature__heading text-xl font-semibold">Fast</h3>
          <p className="feature__body text-[#92400e]">
            Compiles in <strong>milliseconds</strong>.
          </p>
        </div>
        <div className="feature flex-col gap-2 p-4 hidden-body flex">
          <div
            className="feature__icon flex-none w-10 h-10 bg-[#e5e5e5]"
            aria-hidden="true"
          />
          <h3 className="feature__heading text-xl font-semibold">Short</h3>
          <p className="feature__body hidden text-[#52525b]">
            Describe the feature.
          </p>
        </div>
      </section>
    </main>
  );
}
