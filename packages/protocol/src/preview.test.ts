import { describe, expect, it } from "vitest";
import { previewFrameMessage, previewPagePath, usercontentOrigin } from "./preview.ts";

describe("usercontentOrigin", () => {
  const app = "http://localhost:3000";
  it.each([
    ["http://127.0.0.1:8791", app, "local", "http://127.0.0.1:8791"],
    [
      "https://usercontent.truframe.site",
      "https://app.truframe.com",
      "production",
      "https://usercontent.truframe.site",
    ],
    ["http://usercontent.truframe.site", "https://app.truframe.com", "production", null],
    ["http://localhost:8791", app, "local", null],
    ["http://127.0.0.1:8791/", app, "local", null],
    ["http://127.0.0.1:8791/preview", app, "local", null],
    ["", app, "local", null],
    [undefined, app, "local", null],
  ] as const)("%s with app %s (%s) → %s", (value, appUrl, env, expected) => {
    expect(usercontentOrigin(value, appUrl, env)).toBe(expected);
  });
});

describe("previewFrameMessage", () => {
  it.each([
    { type: "tf-preview:ready" },
    { type: "tf-preview:escape" },
    { type: "tf-preview:navigate", path: "/about" },
    { type: "tf-preview:navigate", path: "/blog/post?x=1#top" },
    { type: "tf-preview:open", url: "https://example.com/a" },
    { type: "tf-preview:open", url: "mailto:hi@example.com" },
  ])("accepts %o", (m) => {
    expect(previewFrameMessage.safeParse(m).success).toBe(true);
  });

  it.each([
    null,
    "tf-preview:ready",
    { type: "tf-preview:ready", extra: 1 },
    { type: "tf-preview:navigate", path: "about" },
    { type: "tf-preview:navigate", path: "//evil.example" },
    { type: "tf-preview:open", url: "javascript:alert(1)" },
    { type: "tf-preview:open", url: "data:text/html,hi" },
    { type: "tf-preview:render", html: "" },
  ])("refuses %o", (m) => {
    expect(previewFrameMessage.safeParse(m).success).toBe(false);
  });
});

describe("previewPagePath", () => {
  it.each([
    ["/", "/"],
    ["/about", "/about"],
    ["/about/", "/about"],
    ["/about?ref=nav", "/about"],
    ["/about#team", "/about"],
    ["/#top", "/"],
  ])("%s → %s", (path, expected) => {
    expect(previewPagePath(path)).toBe(expected);
  });
});
