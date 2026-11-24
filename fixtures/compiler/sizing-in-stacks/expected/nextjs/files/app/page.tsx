import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <div className="layouts flex flex-col gap-8 p-8">
        <div className="row flex items-stretch gap-3 flex-none h-30">
          <div className="fixed-el p-2 flex-none w-30 bg-[#e0e7ff]">
            <span className="fixed-label">Fixed</span>
          </div>
          <div className="fill p-2 flex-1 bg-[#e0e7ff]">
            <span className="fill-label">Fill</span>
          </div>
          <div className="fit p-2 flex-none w-fit bg-[#e0e7ff]">
            <span className="fit-label">Fit</span>
          </div>
          <div className="stretch p-2 flex-none self-stretch w-20 bg-[#e0e7ff]">
            <span className="stretch-label">Stretch</span>
          </div>
        </div>
        <div className="column flex flex-col items-start gap-3">
          <div className="full-width p-2 self-stretch bg-[#e0e7ff]">
            <span className="full-width-label">Full width</span>
          </div>
          <div className="grow-el p-2 flex-1 bg-[#e0e7ff]">
            <span className="grow-label">Grow</span>
          </div>
          <div className="fixed-height p-2 flex-none h-12 bg-[#e0e7ff]">
            <span className="fixed-height-label">Fixed height</span>
          </div>
        </div>
        <div className="responsive flex gap-4 mobile:flex-col">
          <div
            className="left p-2 flex-1 bg-[#e0e7ff] mobile:flex-initial mobile:self-stretch"
          >
            <span className="left-label">Left</span>
          </div>
          <div
            className="right p-2 flex-1 bg-[#e0e7ff] mobile:flex-initial mobile:self-stretch"
          >
            <span className="right-label">Right</span>
          </div>
        </div>
      </div>
    </main>
  );
}
