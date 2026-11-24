import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <div className="images flex flex-wrap gap-4">
        <Image
          src="/assets/team.jpg"
          alt="Plain photo"
          width={1600}
          height={900}
          className="plain flex-none w-80 h-45 object-cover"
        />
        <Image
          src="/assets/team.jpg"
          alt="Contained photo"
          width={1600}
          height={900}
          className="contained flex-none w-80 h-45 object-contain"
        />
        <Image
          src="/assets/team.jpg"
          alt="Tiled photo"
          width={1600}
          height={900}
          className="tiled flex-none w-80 h-45 object-none"
        />
        <figure className="figure flex-none w-80 h-45">
          <Image
            src="/assets/team.jpg"
            alt="Figure photo"
            width={1600}
            height={900}
            className="size-full object-cover"
          />
        </figure>
        <picture className="picture flex-none w-80 h-45">
          <Image
            src="/assets/team.jpg"
            alt="Picture photo"
            width={1600}
            height={900}
            className="size-full object-cover"
          />
        </picture>
        <Image
          src="/assets/team.jpg"
          alt=""
          width={1600}
          height={900}
          className="decorative flex-none w-80 h-45 object-cover"
        />
        <div
          className="placeholder flex-none w-80 h-45 bg-[#e5e5e5]"
          role="img"
          aria-label="Coming soon"
        />
        <div
          className="empty-placeholder flex-none w-80 h-45 bg-[#e5e5e5]"
          aria-hidden="true"
        />
        <Image
          src="/assets/logo.svg"
          alt="Acme"
          width={120}
          height={40}
          className="logo flex-none w-30 h-10 object-contain"
        />
      </div>
    </main>
  );
}
