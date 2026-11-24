import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Private",
  description: "Only for the team.",
  robots: { index: false, follow: false },
};

export default function PrivatePage() {
  return (
    <main className="body flex flex-col">
      <h1 className="h">Not indexed</h1>
    </main>
  );
}
