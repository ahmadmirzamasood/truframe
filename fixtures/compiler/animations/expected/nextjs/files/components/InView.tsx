"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Plays In view animations when layers scroll into view (see animations.css).
export default function InView() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || !("IntersectionObserver" in window)) return;
    const view = CSS.supports("animation-timeline: view()");
    const io = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          const el = target as HTMLElement;
          const once = el.classList.contains("tf-view-once");
          if (isIntersecting) {
            el.classList.add("tf-in");
            if (once) io.unobserve(el);
          } else if (!once && el.classList.contains("tf-in")) {
            // Rewind, so it plays again next time.
            el.classList.remove("tf-in");
            el.style.animation = "none";
            void el.offsetWidth;
            el.style.animation = "";
          }
        }
      },
      { threshold: 0.15 },
    );
    const selector = view ? ".tf-view-once" : ".tf-view-once, .tf-view";
    for (const el of document.querySelectorAll(selector)) io.observe(el);
    return () => io.disconnect();
  }, [pathname]);
  return null;
}
