import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <main className="body flex flex-col">
      <h1 className="about">About us</h1>
    </main>
  );
}
