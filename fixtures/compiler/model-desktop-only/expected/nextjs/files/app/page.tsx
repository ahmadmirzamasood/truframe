import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <section
        className="hero flex gap-(--spacing-md) pt-2 pr-2 pb-(--spacing-md) pl-2 bg-(--colors-brand)"
      >
        <h1
          className="text font-(family-name:--text-body-family) text-(length:--text-body-size) [font-weight:var(--text-body-weight)] leading-(--text-body-line-height) tracking-(--text-body-letter-spacing) text-[#111111]"
        >
          Hello <strong>world</strong>
        </h1>
        <Image
          src="/assets/photo.png"
          alt="A photo"
          width={800}
          height={600}
          className="image object-cover"
        />
        <Link href="/about" className="cta">
          <span className="text-el-2">About</span>
        </Link>
        <div className="card p-8 card-2">
          <h3 className="card__title">Hi</h3>
        </div>
      </section>
    </main>
  );
}
