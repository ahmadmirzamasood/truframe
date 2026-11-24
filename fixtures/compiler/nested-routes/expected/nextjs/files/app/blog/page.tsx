import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
};

export default function BlogPage() {
  return (
    <main className="body flex flex-col">
      <h1 className="h">Blog</h1>
    </main>
  );
}
