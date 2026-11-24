import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "Who we are.",
};

export default function AboutPage() {
  return (
    <main className="body flex flex-col">
      <h1 className="h">About</h1>
    </main>
  );
}
