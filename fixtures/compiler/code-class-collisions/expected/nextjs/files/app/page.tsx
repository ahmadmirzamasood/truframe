import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <div className="container-el flex">
        <p className="flex-el">Flex</p>
        <p className="grid-el">Grid</p>
        <p className="hidden-el">Hidden</p>
        <p className="text-center-el">Text center</p>
        <p className="card">Card 1</p>
        <p className="card-2">Card 2</p>
        <p className="card-3">Card 3</p>
        <p className="text">Unnamed text</p>
        <p className="text-el-2">Emoji name</p>
        <p className="layer-2024-plans">Starts with a digit</p>
        <p className="hero-section">Pascal case</p>
        <p className="p">Single letter</p>
        <p className="p-el-2">Single letter again</p>
        <p className="group-el">Variant name</p>
        <p className="mobile-el">Our breakpoint variant</p>
      </div>
    </main>
  );
}
