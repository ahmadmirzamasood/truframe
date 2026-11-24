import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return (
    <main className="body flex flex-col w-full h-fit">
      <p className="braces">
        Use &#123;curly&#125; braces, &lt;angle&gt; brackets &amp; ampersands.
      </p>
      <p className="quotes">"Double", 'single' and `backticks` \ backslash.</p>
      <p className="unicode">Grüezi 👋 — naïve café, 日本語.</p>
      <p className="whitespace text-center">  leading and trailing  </p>
      <p className="multiline">Line one<br />Line two<br /><br />Line four</p>
      <p className="long">
        This sentence is long enough that the printer must move it onto its own line instead of keeping it next to the tag.
      </p>
    </main>
  );
}
