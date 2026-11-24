import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <section
        className="gallery grid grid-cols-4 gap-4 p-16 tablet:grid-cols-2 mobile:grid-cols-1 mobile:gap-2 mobile:px-4 mobile:py-6"
      >
        <figure
          className="one col-span-2 row-span-2 aspect-square overflow-clip rounded-xl mobile:col-span-1 mobile:row-span-1"
        >
          <Image
            src="/assets/photo-1.jpg"
            alt="Photo 1"
            width={1200}
            height={900}
            className="size-full object-cover"
          />
        </figure>
        <figure
          className="two col-span-1 row-span-1 aspect-[1.3333] overflow-clip rounded-xl"
        >
          <Image
            src="/assets/photo-2.jpg"
            alt="Photo 2"
            width={1200}
            height={900}
            className="size-full object-contain"
          />
        </figure>
        <figure
          className="three col-span-1 row-span-1 aspect-[1.3333] overflow-clip rounded-xl"
        >
          <Image
            src="/assets/photo-3.jpg"
            alt="Photo 3"
            width={1200}
            height={900}
            className="size-full object-cover"
          />
        </figure>
        <figure
          className="four col-span-1 row-span-1 aspect-[1.3333] overflow-clip rounded-xl"
        >
          <Image
            src="/assets/photo-4.jpg"
            alt="Photo 4"
            width={1200}
            height={900}
            className="size-full object-contain"
          />
        </figure>
        <figure
          className="five col-span-1 row-span-1 aspect-[1.3333] overflow-clip rounded-xl"
        >
          <Image
            src="/assets/photo-5.jpg"
            alt="Photo 5"
            width={1200}
            height={900}
            className="size-full object-cover"
          />
        </figure>
      </section>
    </main>
  );
}
