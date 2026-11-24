import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <header className="header flex items-center justify-between px-8 py-4">
        <p className="logo font-bold">Acme</p>
        <nav className="desktop-nav flex gap-6 mobile:hidden">
          <span className="a">Home</span>
          <span className="b">Work</span>
        </nav>
        <span className="menu hidden font-semibold mobile:inline">Menu</span>
        <p className="tablet-note hidden tablet:block mobile:hidden">
          Tablet only
        </p>
      </header>
    </main>
  );
}
