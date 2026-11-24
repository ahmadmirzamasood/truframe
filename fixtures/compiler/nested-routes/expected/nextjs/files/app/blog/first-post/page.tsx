import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "First post | Blog",
};

export default function FirstPostPage() {
  return (
    <main className="body flex flex-col">
      <h1 className="h">First post</h1>
    </main>
  );
}
