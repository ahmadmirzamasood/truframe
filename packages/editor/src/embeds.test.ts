import { describe, expect, it } from "vitest";
import { base64Url, embedFrameUrl } from "./embeds.ts";

const decode = (b64: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
  );

describe("embed frame URLs", () => {
  it("carries HTML in the fragment as base64url UTF-8", () => {
    const html = '<p class="x">Grüezi 👋 & <b>hi</b></p>';
    const url = new URL(embedFrameUrl("https://usercontent.example", { type: "html", html }));
    expect(url.origin).toBe("https://usercontent.example");
    expect(url.pathname).toBe("/embed");
    const h = new URLSearchParams(url.hash.slice(1)).get("h") ?? "";
    expect(h).toMatch(/^[A-Za-z0-9_-]*$/);
    expect(decode(h)).toBe(html);
    expect(base64Url("a".repeat(100_000)).length).toBeGreaterThan(100_000);
  });

  it("changes the query when the content changes, so the frame reloads", () => {
    const a = embedFrameUrl("https://u.example", { type: "html", html: "a" });
    const b = embedFrameUrl("https://u.example", { type: "html", html: "b" });
    expect(new URL(a).search).not.toBe(new URL(b).search);
    expect(embedFrameUrl("https://u.example", { type: "html", html: "a" })).toBe(a);
  });

  it("passes URLs encoded", () => {
    const url = new URL(
      embedFrameUrl("https://u.example", { type: "url", url: "https://maps.example/?q=a&b=c" }),
    );
    expect(new URLSearchParams(url.hash.slice(1)).get("u")).toBe("https://maps.example/?q=a&b=c");
  });
});
