import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <div className="effects flex flex-wrap gap-6 p-8">
        <div
          className="hairline flex-none w-40 h-25 border border-[#e4e4e7] rounded-lg"
        />
        <div
          className="dashed flex-none w-40 h-25 border-2 border-dashed border-[#a1a1aa] rounded-xl"
        />
        <div
          className="underline-el flex-none w-40 h-25 border-b-[3px] border-[#18181b]"
        />
        <div
          className="corners flex-none w-40 h-25 rounded-tl-3xl rounded-tr-sm rounded-br-3xl rounded-bl-sm"
        />
        <div className="pill flex-none w-40 h-25 bg-[#f4f4f5] rounded-full" />
        <div
          className="shadow-el flex-none w-40 h-25 rounded-2xl shadow-[0px_10px_15px_-3px_#0000001a,0px_4px_6px_-4px_#0000001a]"
        />
        <div
          className="inset flex-none w-40 h-25 shadow-[inset_0px_2px_4px_0px_#0000000d]"
        />
        <div className="faded flex-none w-40 h-25 bg-[#22c55e] opacity-50" />
        <div className="blurred flex-none w-40 h-25 bg-[#22c55e] blur-[8px]" />
        <div
          className="clipped flex-none w-40 h-25 min-w-25 max-w-100 min-h-12.5 max-h-75 overflow-clip"
        />
      </div>
    </main>
  );
}
