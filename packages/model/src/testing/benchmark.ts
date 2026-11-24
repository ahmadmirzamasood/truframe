/**
 * A one-page document of about `layers` layers for compiler benchmarks: sections of cards
 * (frame, heading, text, image, link with label) with tablet/mobile overrides and variables.
 */
import { createDocument } from "../defaults.ts";
import type { ProjectDocument } from "../document.ts";
import type { Node } from "../nodes.ts";
import { FIXTURE_PROJECT_ID } from "./fixtures.ts";

export function benchmarkPage(layers: number): ProjectDocument {
  let n = 0;
  const doc = createDocument({
    id: FIXTURE_PROJECT_ID,
    framework: "nextjs",
    ids: () => `id${++n}`,
  });
  const body = doc.nodes[doc.pages[0]?.root ?? ""];
  if (body?.type !== "frame") throw new Error("no body");
  doc.variables = {
    brand: {
      id: "brand",
      type: "color",
      name: "Brand",
      group: "Brand",
      cssName: "--brand",
      value: { desktop: "#2563eb", mobile: "#1d4ed8" },
    },
    gap: {
      id: "gap",
      type: "spacing",
      name: "Gap",
      group: "Spacing",
      cssName: "--gap",
      value: { desktop: 24, tablet: 16, mobile: 12 },
    },
  };
  doc.assets.photo = {
    id: "photo",
    name: "photo.jpg",
    mime: "image/jpeg",
    width: 1200,
    height: 800,
    bytes: 1000,
    key: `assets/${"ab".repeat(32)}.jpg`,
  };
  let id = 0;
  const add = (node: Record<string, unknown>) => {
    const key = `b${++id}`;
    doc.nodes[key] = { ...node, id: key } as unknown as Node;
    return key;
  };
  // Each card is 6 layers; each section adds 2 (frame + heading).
  let count = 1;
  let s = 0;
  while (count < layers) {
    s++;
    const cards: string[] = [];
    for (let c = 0; c < 6 && count < layers; c++) {
      const title = add({
        type: "text",
        name: "Title",
        tag: "h3",
        style: { desktop: { fontSize: 24, fontWeight: 600 }, mobile: { fontSize: 20 } },
        content: [{ text: `Card ${s}.${c}` }],
      });
      const body = add({
        type: "text",
        name: "Body",
        tag: "p",
        style: { desktop: { textColor: "#52525b", lineHeight: 1.5 } },
        content: [
          { text: "Short supporting copy for this card, " },
          { text: "with emphasis", bold: true },
          { text: "." },
        ],
      });
      const image = add({
        type: "image",
        name: "Photo",
        tag: "img",
        style: { desktop: { width: { type: "fill" }, aspectRatio: 1.5, radius: 12 } },
        assetId: "photo",
        alt: "Photo",
        decorative: false,
        fit: "fill",
      });
      const label = add({
        type: "text",
        name: "Label",
        tag: "span",
        style: { desktop: { fontWeight: 600 } },
        content: [{ text: "Read more" }],
      });
      const link = add({
        type: "link",
        name: "More",
        tag: "a",
        style: { desktop: { display: "stack", gap: 8, textColor: { var: "brand" } } },
        target: { type: "url", href: "/more" },
        newTab: false,
        children: [label],
      });
      cards.push(
        add({
          type: "frame",
          name: "Card",
          tag: "article",
          style: {
            desktop: {
              display: "stack",
              direction: "column",
              gap: { var: "gap" },
              padding: { top: 24, right: 24, bottom: 24, left: 24 },
              radius: 16,
              fill: { type: "solid", color: "#ffffff" },
              shadows: [{ x: 0, y: 4, blur: 12, spread: 0, color: "#0000001a", inset: false }],
            },
            mobile: { padding: { top: 16, right: 16, bottom: 16, left: 16 } },
          },
          children: [image, title, body, link],
        }),
      );
      count += 6;
    }
    const heading = add({
      type: "text",
      name: "Section title",
      tag: "h2",
      style: {
        desktop: { fontSize: 48, fontWeight: 700 },
        tablet: { fontSize: 36 },
        mobile: { fontSize: 30 },
      },
      content: [{ text: `Section ${s}` }],
    });
    const grid = add({
      type: "frame",
      name: "Grid",
      tag: "div",
      style: {
        desktop: { display: "grid", gridColumns: 3, gap: { var: "gap" } },
        tablet: { gridColumns: 2 },
        mobile: { gridColumns: 1 },
      },
      children: cards,
    });
    body.children.push(
      add({
        type: "frame",
        name: "Section",
        tag: "section",
        style: {
          desktop: {
            display: "stack",
            direction: "column",
            gap: 32,
            padding: { top: 96, right: 64, bottom: 96, left: 64 },
          },
          mobile: { padding: { top: 48, right: 16, bottom: 48, left: 16 } },
        },
        children: [heading, grid],
      }),
    );
    count += 3;
  }
  return doc;
}
