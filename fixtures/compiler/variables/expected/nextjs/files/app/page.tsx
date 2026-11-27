import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <section
        className="section flex flex-col gap-(--space-stack) p-(--space-gutter) border-b border-(color:--brand-accent)"
      >
        <h1
          className="title font-(family-name:--font-display-family) text-(length:--font-display-size) [font-weight:var(--font-display-weight)] leading-(--font-display-line-height) tracking-(--font-display-letter-spacing) text-(color:--neutral-ink)"
        >
          Bound to variables
        </h1>
        <a
          href="#start"
          className="cta px-(--space-stack) py-3 w-(--size-cta-width) text-[#ffffff] bg-(--brand-accent) rounded-(--radius-round)"
        >
          <span className="label font-semibold">Start</span>
        </a>
      </section>
    </main>
  );
}
