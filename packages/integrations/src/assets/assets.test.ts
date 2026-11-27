/**
 * T4 (SECURITY): SVGs with `<script>`, `onload`, `foreignObject` or external `href` are
 * sanitized; polyglot and mislabelled uploads are rejected. Plus sizes from headers.
 */
import { describe, expect, it } from "vitest";
import { imageSize } from "./dimensions.ts";
import { sniffUpload } from "./sniff.ts";
import { sanitizeSvg } from "./svg.ts";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
const text = (s: string) => new TextEncoder().encode(s);

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** A PNG signature + IHDR chunk for w×h. */
const png = (w: number, h: number) =>
  bytes(
    PNG_HEAD,
    [0, 0, 0, 13],
    "IHDR",
    [w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255],
    [h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, h & 255],
    [8, 6, 0, 0, 0],
  );

function clean(svg: string): string {
  const r = sanitizeSvg(svg);
  if (!r.ok) throw new Error(r.message);
  return r.svg;
}

describe("T4: SVG sanitizer", () => {
  it("removes <script> elements and their content", () => {
    const out = clean(
      '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
    );
    expect(out).not.toMatch(/script|alert/i);
    expect(out).toContain('<rect width="10" height="10"/>');
  });

  it("removes event handlers in any case", () => {
    const out = clean(
      '<svg onload="alert(1)" ONLOAD="x()"><circle r="4" onclick="steal()" onmouseover=\'y()\'/></svg>',
    );
    expect(out).not.toMatch(/on\w+=|alert|steal/i);
    expect(out).toContain('<circle r="4"/>');
  });

  it("removes foreignObject and the HTML inside it", () => {
    const out = clean(
      '<svg><foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="https://evil.example"></iframe><img src=x onerror=alert(1)></body></foreignObject><g/></svg>',
    );
    expect(out).not.toMatch(/foreignObject|iframe|body|onerror|evil/i);
    expect(out).toContain("<g/>");
  });

  it("removes external references but keeps same-document ones", () => {
    const out = clean(
      '<svg><defs><linearGradient id="g"/></defs>' +
        '<use href="https://evil.example/x.svg#a"/>' +
        '<use xlink:href="data:image/svg+xml;base64,PHN2Zz4="/>' +
        '<image href="https://evil.example/a.png"/>' +
        '<a href="javascript:alert(1)"><rect/></a>' +
        '<rect fill="url(https://evil.example/f)" stroke="url(#g)"/>' +
        '<use href="#g"/></svg>',
    );
    expect(out).not.toMatch(/evil|data:|javascript|<image|<a\b/i);
    expect(out).toContain('stroke="url(#g)"');
    expect(out).toContain('<use href="#g"/>');
  });

  it("catches encoded javascript: and refuses DOCTYPE/entities", () => {
    const out = clean('<svg><use href="&#106;avascript:alert(1)"/></svg>');
    expect(out).not.toMatch(/javascript|alert/i);
    expect(clean('<svg><rect fill="url(java&#9;script:alert(1))"/></svg>')).not.toMatch(/script|alert/i);
    const r = sanitizeSvg('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>');
    expect(r.ok).toBe(false);
  });

  it("drops styles, animation, prefixed and unknown elements, and anything after the root", () => {
    const out = clean(
      "<svg><style>@import url(https://evil.example/a.css)</style><svg:script>x()</svg:script>" +
        '<set attributeName="href" to="javascript:alert(1)"/><animate attributeName="onload"/>' +
        '<rect style="background:url(https://evil.example)"/></svg><script>alert(2)</script>',
    );
    expect(out).not.toMatch(/style|import|script|set|animate|evil|alert/i);
    expect(out).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect/></svg>',
    );
  });

  it("keeps an ordinary icon intact and escapes text", () => {
    const out = clean(
      '<?xml version="1.0"?><!-- logo --><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><title>Logo &amp; mark</title><path d="M0 0h24v24H0z" fill="#111"/><text x="2" y="20">a &lt; b</text></svg>',
    );
    expect(out).toContain('<path d="M0 0h24v24H0z" fill="#111"/>');
    expect(out).toContain("<title>Logo &amp; mark</title>");
    expect(out).toContain("a &lt; b");
    expect(out).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  });

  it("refuses files without an svg root", () => {
    expect(sanitizeSvg("<html><script>x</script></html>").ok).toBe(false);
  });
});

describe("T4: upload sniffing", () => {
  it("accepts each type by its bytes, with a matching name", () => {
    expect(sniffUpload(png(4, 4), "a.png")).toMatchObject({ ok: true, mime: "image/png" });
    expect(sniffUpload(bytes([0xff, 0xd8, 0xff, 0xe0]), "a.JPEG")).toMatchObject({
      ok: true,
      mime: "image/jpeg",
    });
    expect(sniffUpload(bytes("GIF89a", [1, 0, 1, 0]), "a.gif")).toMatchObject({ ok: true });
    expect(sniffUpload(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "), "a.webp")).toMatchObject({
      ok: true,
    });
    expect(sniffUpload(text('<?xml version="1.0"?>\n<svg/>'), "a.svg")).toMatchObject({
      ok: true,
      mime: "image/svg+xml",
    });
  });

  it("rejects a name that doesn't match the bytes", () => {
    expect(sniffUpload(png(4, 4), "a.jpg")).toMatchObject({ ok: false, code: "TYPE_MISMATCH" });
    expect(sniffUpload(text("<svg/>"), "a.png")).toMatchObject({
      ok: false,
      code: "TYPE_MISMATCH",
    });
  });

  it("rejects HTML and unknown types, whatever the name", () => {
    expect(sniffUpload(text("<html><script>alert(1)</script></html>"), "a.png")).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_TYPE",
    });
    expect(sniffUpload(bytes("%PDF-1.7"), "a.pdf")).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_TYPE",
    });
    expect(sniffUpload(new Uint8Array(), "a.png")).toMatchObject({ ok: false, code: "EMPTY" });
  });

  it("rejects polyglots: a valid image header with web page code inside", () => {
    const gifar = bytes("GIF89a", [1, 0, 1, 0], "<html><body><script>alert(1)</script>");
    expect(sniffUpload(gifar, "a.gif")).toMatchObject({ ok: false, code: "POLYGLOT" });
    const pngHtml = bytes([...png(1, 1)], "tEXt<SCRIPT >fetch('//evil')</script>");
    expect(sniffUpload(pngHtml, "a.png")).toMatchObject({ ok: false, code: "POLYGLOT" });
    const jpegJs = bytes([0xff, 0xd8, 0xff, 0xfe], "javascript:alert(1)");
    expect(sniffUpload(jpegJs, "a.jpg")).toMatchObject({ ok: false, code: "POLYGLOT" });
  });
});

describe("image sizes", () => {
  it("reads sizes from headers", () => {
    expect(imageSize("image/png", png(640, 480))).toEqual({ width: 640, height: 480 });
    expect(imageSize("image/gif", bytes("GIF89a", [0x20, 0x03, 0x58, 0x02]))).toEqual({
      width: 800,
      height: 600,
    });
    // JPEG: SOI, an APP0 segment, then SOF0 with height 300 and width 400.
    const jpeg = bytes([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 1, 44, 1, 144, 3,
    ]);
    expect(imageSize("image/jpeg", jpeg)).toEqual({ width: 400, height: 300 });
    const vp8x = bytes(
      "RIFF",
      [0, 0, 0, 0],
      "WEBPVP8X",
      [10, 0, 0, 0, 0, 0, 0, 0],
      [0x7f, 0x02, 0],
      [0xdf, 0x01, 0],
    );
    expect(imageSize("image/webp", vp8x)).toEqual({ width: 640, height: 480 });
    expect(imageSize("image/svg+xml", text('<svg width="24" height="24"/>'))).toEqual({
      width: 24,
      height: 24,
    });
    expect(imageSize("image/svg+xml", text('<svg viewBox="0 0 100 50"/>'))).toEqual({
      width: 100,
      height: 50,
    });
    expect(imageSize("image/svg+xml", text('<svg width="200" viewBox="0 0 100 50"/>'))).toEqual({
      width: 200,
      height: 100,
    });
    expect(imageSize("image/svg+xml", text("<svg/>"))).toEqual({ width: 300, height: 150 });
    expect(imageSize("image/png", bytes(PNG_HEAD))).toBeNull();
  });
});
