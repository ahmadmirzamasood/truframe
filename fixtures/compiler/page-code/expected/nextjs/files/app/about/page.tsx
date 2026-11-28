import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <>
      <main className="body flex flex-col">
        <h1 className="title">About</h1>
      </main>
      <style dangerouslySetInnerHTML={{ __html: "body{margin:0}" }} />
    </>
  );
}
