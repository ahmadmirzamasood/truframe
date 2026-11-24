import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acme — \"Quotes\" & <Symbols>",
  description: "Line one.\nLine two with 'quotes'.",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <h1 className="title">SEO</h1>
    </main>
  );
}
