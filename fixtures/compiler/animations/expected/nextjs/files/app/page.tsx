import type { Metadata } from "next";
import Badge from "@/components/Badge";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <h2 className="fade-in text-2xl tf-anim tf-view-once [--tf-opacity:0]">
        Fade in
      </h2>
      <h2
        className="slide-up text-2xl tf-anim tf-load [--tf-opacity:0] [--tf-y:24px]"
      >
        Slide up
      </h2>
      <h2
        className="slide-in-left text-2xl tf-anim tf-view-once [--tf-opacity:0] [--tf-x:-40px]"
      >
        Slide in left
      </h2>
      <h2
        className="slide-in-right text-2xl tf-anim tf-load [--tf-opacity:0] [--tf-x:40px]"
      >
        Slide in right
      </h2>
      <h2
        className="scale-in text-2xl tf-anim tf-view-once [--tf-opacity:0] [--tf-scale:0.9]"
      >
        Scale in
      </h2>
      <h2
        className="blur-in text-2xl tf-anim tf-load tf-blur [--tf-opacity:0] [--tf-blur:8px]"
      >
        Blur in
      </h2>
      <p
        className="every-time tf-anim tf-view [--tf-opacity:0] [--tf-y:40px] [--tf-ease:ease-in-out]"
      >
        Every time
      </p>
      <p
        className="loop tf-anim tf-loop [--tf-scale:1.05] [--tf-duration:1500ms] [--tf-ease:ease-in-out]"
      >
        Loop
      </p>
      <p
        className="custom tf-anim tf-load tf-blur [--tf-opacity:0.2] [--tf-x:-12px] [--tf-y:8px] [--tf-scale:0.95] [--tf-rotate:-4deg] [--tf-blur:2px] [--tf-duration:450ms] [--tf-delay:250ms] [--tf-ease:cubic-bezier(0.34,1.56,0.64,1)]"
      >
        Custom
      </p>
      <p
        className="off-on-mobile tf-anim tf-load [--tf-opacity:0] [--tf-ease:linear] mobile:[animation:none]"
      >
        Off on mobile
      </p>
      <p
        className="off-on-tablet tf-anim tf-load [--tf-opacity:0] [--tf-ease:ease] tablet:[animation:none] mobile:[animation:revert-layer]"
      >
        Off on tablet
      </p>
      <div className="cards grid grid-cols-3 gap-4">
        <div
          className="one p-4 tf-anim tf-view-once [--tf-opacity:0] [--tf-y:24px] [--tf-delay:50ms]"
        />
        <div
          className="two p-4 tf-anim tf-view-once [--tf-opacity:0] [--tf-y:24px] [--tf-delay:150ms]"
        />
        <div
          className="three p-4 tf-anim tf-view-once [--tf-opacity:0] [--tf-y:24px] [--tf-delay:250ms]"
        />
      </div>
      <Badge
        className="badge-2 tf-anim tf-view-once [--tf-opacity:0] [--tf-scale:0.9]"
      />
    </main>
  );
}
