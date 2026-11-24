import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <nav className="nav flex justify-between gap-6">
        <Link href="/about" className="page-link flex items-center gap-2">
          <span className="t1">About</span>
        </Link>
        <Link href="/about#team" className="path-link flex items-center gap-2">
          <span className="t2">Team</span>
        </Link>
        <a href="#pricing" className="anchor flex items-center gap-2">
          <span className="t3">Pricing</span>
        </a>
        <a
          href="https://example.com"
          target="_blank"
          rel="noopener noreferrer"
          className="external flex items-center gap-2"
        >
          <span className="t4">Docs</span>
        </a>
        <a
          href="mailto:hello@example.com"
          className="mail flex items-center gap-2"
        >
          <span className="t5">Email</span>
        </a>
        <a href="tel:+1 555 0100" className="phone flex items-center gap-2">
          <span className="t6">Call</span>
        </a>
        <Link
          href="/about"
          className="icon-only flex items-center gap-2"
          aria-label="Next page"
        >
          <span className="arrow flex-none w-4 h-4" aria-hidden="true">
            <img
              src="https://api.iconify.design/lucide/arrow-right.svg"
              alt=""
              className="block size-full"
            />
          </span>
        </Link>
      </nav>
    </main>
  );
}
