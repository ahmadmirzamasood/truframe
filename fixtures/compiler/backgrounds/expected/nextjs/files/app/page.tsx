import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <div className="backgrounds grid grid-cols-3 gap-4">
        <div className="solid h-30 bg-[#0ea5e9]" />
        <div className="alpha h-30 bg-[#0ea5e980]" />
        <div
          className="gradient h-30 bg-[linear-gradient(135deg,#6366f1_0%,#ec4899_60%,#f59e0b_100%)]"
        />
        <div
          className="tile h-30 bg-[url(/assets/pattern.png)] bg-auto bg-repeat"
        />
        <div
          className="cover h-30 bg-[url(/assets/cover.webp)] bg-cover bg-center bg-no-repeat mobile:bg-none mobile:bg-[#111827]"
        />
        <div
          className="contain h-30 bg-[url(/assets/cover.webp)] bg-contain bg-center bg-no-repeat mix-blend-multiply"
        />
      </div>
    </main>
  );
}
