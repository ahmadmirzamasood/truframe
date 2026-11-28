import { describe, expect, it } from "vitest";
import { sanitizeEmbedHtml } from "./embed.ts";

describe("sanitizeEmbedHtml", () => {
  it("keeps embed markup and scripts", () => {
    const html = '<div id="map"></div>\n<script src="https://maps.example/x.js"></script>';
    expect(sanitizeEmbedHtml(`  ${html}\n`)).toBe(html);
  });

  it("removes base, http-equiv metas and control characters", () => {
    expect(
      sanitizeEmbedHtml(
        '<base href="https://evil.example/"><META HTTP-EQUIV="refresh" content="0;url=x">a\u0000b<meta charset="utf-8">',
      ),
    ).toBe('ab<meta charset="utf-8">');
  });

  it("can't be tricked into assembling a tag", () => {
    expect(sanitizeEmbedHtml("<ba<base>se href=x>")).toBe("");
  });

  it("is idempotent", () => {
    const once = sanitizeEmbedHtml("<p>hi</p><base href=/>");
    expect(sanitizeEmbedHtml(once)).toBe(once);
  });
});
