import { iconSvgSchema } from "@truframe/model";
import { describe, expect, it } from "vitest";
import {
  catalogFont,
  FONT_FILE_PATH,
  googleCssUrl,
  googleFonts,
  iconifyApi,
  LOCAL_ICONS,
  parseIconBody,
  samplePhotos,
  unsplash,
} from "./index.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("parseIconBody", () => {
  it("reads Iconify bodies into SVG data", () => {
    const svg = parseIconBody(
      '<g fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><circle cx="12" cy="12" r="3"/></g>',
      24,
      24,
    );
    expect(svg).toEqual({
      viewBox: "0 0 24 24",
      body: [
        {
          tag: "g",
          attrs: { fill: "none", stroke: "currentColor", "stroke-width": "2" },
          children: [
            { tag: "path", attrs: { d: "M5 12h14" } },
            { tag: "circle", attrs: { cx: "12", cy: "12", r: "3" } },
          ],
        },
      ],
    });
  });

  it.each([
    ["script", "<script>alert(1)</script>"],
    ["event handler", '<path d="M0 0" onload="x"/>'],
    ["reference", '<path d="M0 0" fill="url(#a)"/>'],
    ["defs", '<defs><path d="M0 0"/></defs>'],
    ["text", 'hello<path d="M0 0"/>'],
    ["unclosed", '<g><path d="M0 0"/>'],
    ["mismatched", '<g><path d="M0 0"/></path>'],
    ["empty", ""],
  ])("refuses %s", (_, body) => {
    expect(parseIconBody(body)).toBeNull();
  });

  it("local icons are valid", () => {
    for (const i of LOCAL_ICONS) expect(iconSvgSchema.safeParse(i.svg).success).toBe(true);
  });
});

describe("iconifyApi", () => {
  it("searches allowed sets and fetches drawings with sorted names", async () => {
    const urls: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/search"))
        return json({ icons: ["lucide:star", "lucide:sparkle", "mdi:star"] });
      if (url.includes("/lucide.json"))
        return json({
          prefix: "lucide",
          width: 24,
          height: 24,
          icons: { star: { body: '<path d="M1 1"/>' }, sparkle: { body: "<use href='x'/>" } },
        });
      return json({ prefix: "mdi", icons: { star: { body: '<path d="M2 2"/>' } } });
    }) as typeof fetch;
    const out = await iconifyApi(fetcher, "https://icons.test").search("star", 10);
    expect(out.map((i) => `${i.set}:${i.icon}`)).toEqual(["lucide:star", "mdi:star"]);
    expect(out[1]?.svg.viewBox).toBe("0 0 16 16");
    expect(urls[0]).toContain("limit=32");
    expect(urls[0]).toContain("prefixes=lucide%2Ctabler%2Cph%2Cmdi%2Cheroicons");
    expect(urls[1]).toBe("https://icons.test/lucide.json?icons=sparkle,star");
  });
});

describe("fonts", () => {
  it("builds Google's css2 URL from catalog weights only", () => {
    expect(googleCssUrl(["Lato", "Arial", "Space Mono"])).toBe(
      "https://fonts.googleapis.com/css2?family=Lato:wght@100;300;400;700;900&family=Space+Mono:wght@400;700&display=swap",
    );
    expect(googleCssUrl(["Nope"])).toBeNull();
    expect(catalogFont("Inter")?.weights).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900]);
  });

  it("rewrites font file URLs to the proxy and only forwards font paths", async () => {
    const seen: string[] = [];
    const fetcher = (async (input: string | URL | Request) => {
      seen.push(String(input));
      return new Response(
        "@font-face{src:url(https://fonts.gstatic.com/s/inter/v18/abc_DEF-1.woff2)}",
      );
    }) as typeof fetch;
    const proxy = googleFonts(fetcher);
    expect(await proxy.css(["Inter"], "/api/fonts/files/")).toBe(
      "@font-face{src:url(/api/fonts/files/s/inter/v18/abc_DEF-1.woff2)}",
    );
    expect(FONT_FILE_PATH.test("s/inter/v18/abc_DEF-1.woff2")).toBe(true);
    expect(await proxy.file("../../etc/passwd")).toBeNull();
    expect(await proxy.file("s/inter/v18/x.woff2?x=1")).toBeNull();
    expect(seen).toHaveLength(1);
  });
});

describe("photos", () => {
  it("unsplash: Client-ID auth, download tracking, referral links", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const photo = {
      id: "abc",
      width: 4000,
      height: 3000,
      alt_description: "A hill",
      urls: {
        raw: "https://images.unsplash.com/photo-1?ixid=x",
        regular: "",
        small: "s",
        thumb: "",
      },
      user: { name: "Ada", links: { html: "https://unsplash.com/@ada" } },
      links: { download_location: "https://api.unsplash.com/photos/abc/download?ixid=x" },
    };
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
      if (url.startsWith("https://images.unsplash.com")) return new Response(new Uint8Array([1]));
      if (url.includes("/download")) return json({ url: "" });
      return json(photo);
    }) as typeof fetch;
    const file = await unsplash("key", fetcher).download("abc");
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.unsplash.com/photos/abc",
      "https://api.unsplash.com/photos/abc/download?ixid=x",
      "https://images.unsplash.com/photo-1?ixid=x&w=2400&fm=jpg&q=80",
    ]);
    expect(calls[0]?.auth).toBe("Client-ID key");
    expect(calls[2]?.auth).toBeNull();
    expect(file?.photo.authorUrl).toBe(
      "https://unsplash.com/@ada?utm_source=truframe&utm_medium=referral",
    );
    expect(await unsplash("key", fetcher).download("../x")).toBeNull();
  });

  it("samples work without a key", async () => {
    expect(samplePhotos.sample).toBe(true);
    expect((await samplePhotos.search("ocean", 1)).map((p) => p.id)).toEqual(["ocean"]);
    const file = await samplePhotos.download("ocean");
    expect(new TextDecoder().decode(file?.bytes)).toContain("<svg");
  });
});
