import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <div className="banner flex justify-center p-10">
        <p className="text">No smaller breakpoints</p>
      </div>
    </main>
  );
}
