import { describe, expect, it } from "vitest";
import { pageCodeSchema, parseSnippet, printSnippet } from "./snippets.ts";

describe("page code snippets", () => {
  it("parses analytics tags, metas, links, styles and comments", () => {
    const r = parseSnippet(`
      <!-- Plausible -->
      <script defer data-domain="example.com" src="https://plausible.io/js/script.js"></script>
      <meta name='google-site-verification' content=abc123>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <script type="application/ld+json">{"@type":"Organization"}</script>
      <style>body { color: red }</style>
      <noscript><img src="https://px.example.com/1.gif"></noscript>
    `);
    if (!r.ok) throw new Error(r.message);
    expect(r.elements.map((e) => e.tag)).toEqual([
      "script",
      "meta",
      "link",
      "script",
      "style",
      "noscript",
    ]);
    expect(r.elements[0]?.attrs).toEqual([
      ["defer", ""],
      ["data-domain", "example.com"],
      ["src", "https://plausible.io/js/script.js"],
    ]);
    expect(r.elements[1]?.attrs).toEqual([
      ["name", "google-site-verification"],
      ["content", "abc123"],
    ]);
    expect(r.elements[3]?.text).toBe('{"@type":"Organization"}');
  });

  it("prints what it parsed, and parsing the print gives the same data", () => {
    const r = parseSnippet(
      `<script async src="https://a.example/x.js"></script><meta name="a" content='say "hi"'>`,
    );
    if (!r.ok) throw new Error(r.message);
    const text = printSnippet(r.elements);
    expect(text).toBe(
      '<script async src="https://a.example/x.js"></script>\n<meta name="a" content="say &quot;hi&quot;">',
    );
    const again = parseSnippet(text);
    expect(again.ok && again.elements).toEqual(r.elements);
  });

  it("refuses other markup and unsafe URLs with a plain message", () => {
    expect(parseSnippet("<div>hi</div>")).toEqual({
      ok: false,
      message:
        "<div> isn't allowed. Only <script>, <style>, <noscript>, <meta> and <link> can go in page code.",
    });
    expect(parseSnippet("hello")).toMatchObject({ ok: false });
    expect(parseSnippet("<script>alert(1)")).toEqual({
      ok: false,
      message: "<script> needs a closing </script>.",
    });
    expect(parseSnippet('<script src="javascript:alert(1)"></script>')).toMatchObject({
      ok: false,
      message: expect.stringContaining("src and href must start with https://"),
    });
    expect(parseSnippet('<link href="//evil.example/x.css">')).toMatchObject({ ok: false });
    expect(parseSnippet("<!-- open")).toMatchObject({ ok: false });
  });

  it("validates stored page code", () => {
    expect(pageCodeSchema.safeParse({ head: [], body: [] }).success).toBe(true);
    expect(
      pageCodeSchema.safeParse({ head: [{ tag: "meta", attrs: [], text: "x" }], body: [] }).success,
    ).toBe(false);
    expect(
      pageCodeSchema.safeParse({
        head: [{ tag: "script", attrs: [], text: "a</script><b>" }],
        body: [],
      }).success,
    ).toBe(false);
    expect(
      pageCodeSchema.safeParse({
        head: [{ tag: "script", attrs: [["Src", "x"]], text: "" }],
        body: [],
      }).success,
    ).toBe(false);
  });
});
