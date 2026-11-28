/**
 * Insert tools (PRD F4): Stack and Grid frames, Text, Image placeholder, Button (a link with a
 * label) and Icon. Each tool builds a small valid subtree with sensible defaults; inserting it
 * is one `insertNodes` op, so one undo step.
 */
import { childrenOf, type Node, newId, type ProjectDocument } from "@truframe/model";
import type { Op } from "@truframe/ops";

export const INSERT_TOOLS = ["stack", "grid", "text", "image", "button", "icon"] as const;
export type InsertTool = (typeof INSERT_TOOLS)[number];

export const INSERT_LABEL: Record<InsertTool, string> = {
  stack: "Stack",
  grid: "Grid",
  text: "Text",
  image: "Image",
  button: "Button",
  icon: "Icon",
};

/** Single-key shortcuts while the canvas has focus (also listed in the command registry). */
export const INSERT_SHORTCUT: Partial<Record<InsertTool, string>> = {
  stack: "F",
  grid: "G",
  text: "T",
  image: "I",
  button: "B",
};

/** The new subtree: `[0]` is its root, the rest its descendants. */
export function createNodes(tool: InsertTool, id: () => string = newId): Node[] {
  switch (tool) {
    case "stack":
      return [
        {
          id: id(),
          type: "frame",
          name: "Stack",
          tag: "div",
          style: {
            desktop: {
              display: "stack",
              direction: "column",
              gap: 16,
              padding: { top: 24, right: 24, bottom: 24, left: 24 },
              width: { type: "fill" },
              height: { type: "fit" },
            },
          },
          children: [],
        },
      ];
    case "grid":
      return [
        {
          id: id(),
          type: "frame",
          name: "Grid",
          tag: "div",
          style: {
            desktop: {
              display: "grid",
              gridColumns: 3,
              gap: 16,
              padding: { top: 24, right: 24, bottom: 24, left: 24 },
              width: { type: "fill" },
              height: { type: "fit" },
            },
          },
          children: [],
        },
      ];
    case "text":
      return [
        {
          id: id(),
          type: "text",
          // Unnamed: the Layers panel shows its words until it is renamed.
          name: "",
          tag: "p",
          style: { desktop: {} },
          content: [{ text: "Text" }],
        },
      ];
    case "image":
      return [
        {
          id: id(),
          type: "image",
          name: "Image",
          tag: "img",
          style: {
            desktop: {
              width: { type: "fixed", value: 320 },
              height: { type: "fixed", value: 200 },
            },
          },
          assetId: null,
          alt: "",
          decorative: false,
          fit: "fill",
        },
      ];
    case "button": {
      const root = id();
      const label = id();
      return [
        {
          id: root,
          type: "link",
          name: "Button",
          tag: "a",
          target: { type: "url", href: "#" },
          newTab: false,
          style: {
            desktop: {
              display: "stack",
              direction: "row",
              justify: "center",
              align: "center",
              padding: { top: 12, right: 24, bottom: 12, left: 24 },
              fill: { type: "solid", color: "#111827" },
              radius: 8,
            },
          },
          children: [label],
        },
        {
          id: label,
          type: "text",
          name: "Label",
          tag: "span",
          style: { desktop: { fontWeight: 600, textColor: "#ffffff" } },
          content: [{ text: "Button" }],
        },
      ];
    }
    case "icon":
      return [
        {
          id: id(),
          type: "icon",
          name: "Icon",
          tag: "span",
          set: "local",
          icon: "star",
          // A starter drawing so the icon compiles inline before one is picked.
          svg: {
            viewBox: "0 0 24 24",
            body: [
              {
                tag: "path",
                attrs: {
                  d: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
                  fill: "none",
                  stroke: "currentColor",
                  "stroke-width": "2",
                  "stroke-linecap": "round",
                  "stroke-linejoin": "round",
                },
              },
            ],
          },
          style: {
            desktop: { width: { type: "fixed", value: 24 }, height: { type: "fixed", value: 24 } },
          },
        },
      ];
  }
}

export type InsertTarget = { parentId: string; index: number };

/** Whether a node can hold children (frames and links; links can't hold links). */
function canHold(doc: ProjectDocument, parentId: string, tool: InsertTool): boolean {
  const parent = doc.nodes[parentId];
  if (!parent) return false;
  if (parent.type === "frame") return true;
  return parent.type === "link" && tool !== "button";
}

function parentOf(doc: ProjectDocument, id: string): string | null {
  for (const n of Object.values(doc.nodes)) if (childrenOf(n).includes(id)) return n.id;
  return null;
}

/**
 * Where a new layer goes: inside the selected container (at the end), after the selected
 * layer in its parent, or at the end of the page.
 */
export function insertTarget(
  doc: ProjectDocument,
  pageRoot: string,
  selected: string | null,
  tool: InsertTool,
): InsertTarget {
  const end = (parentId: string) => ({
    parentId,
    index: childrenOf(doc.nodes[parentId] as Node).length,
  });
  if (selected && doc.nodes[selected]) {
    if (canHold(doc, selected, tool)) return end(selected);
    let child = selected;
    let parent = parentOf(doc, child);
    // Climb out of links when inserting a button (a link can't contain a link).
    while (parent && !canHold(doc, parent, tool)) {
      child = parent;
      parent = parentOf(doc, child);
    }
    if (parent) {
      const siblings = childrenOf(doc.nodes[parent] as Node);
      return { parentId: parent, index: siblings.indexOf(child) + 1 };
    }
  }
  return end(pageRoot);
}

export function insertOps(nodes: Node[], target: InsertTarget): Op[] {
  return [{ op: "insertNodes", parentId: target.parentId, index: target.index, nodes }];
}
