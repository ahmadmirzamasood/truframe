/** Random-op generator shared by the ops and Loro property tests. */
import {
  BREAKPOINT_IDS,
  childrenOf,
  type Node,
  type ProjectDocument,
  TEMPLATES,
  templateDocument,
} from "@truframe/model";
import { FIXTURE_PROJECT_ID, kitchenSink } from "@truframe/model/testing";
import fc from "fast-check";
import { applyTransaction, type OpLimits } from "./apply.ts";
import type { Op } from "./ops.ts";

export { canonical } from "./testing.ts";

/** Random numbers drawn by fast-check; turned into concrete ops against the current doc. */
export type Choice = { kind: number; a: number; b: number; c: number; d: number };
export const choice = fc.record({
  kind: fc.nat(16),
  a: fc.nat(),
  b: fc.nat(),
  c: fc.nat(),
  d: fc.nat(),
});

const pick = <T>(items: readonly T[], n: number): T | undefined =>
  items[n % Math.max(items.length, 1)];

const PROP_VALUES: [string, unknown][] = [
  ["fontSize", 18],
  ["fontSize", -1],
  ["gap", 12],
  ["gap", { var: "space" }],
  ["gap", { var: "brand" }],
  ["textColor", "#336699"],
  ["textColor", { var: "brand" }],
  ["direction", "column"],
  ["display", "grid"],
  ["width", { type: "fill" }],
  ["width", { type: "fixed", value: 320 }],
  ["padding", { top: 1, right: 2, bottom: 3, left: 4 }],
  ["opacity", 0.5],
  ["fill", { type: "solid", color: "#ffffff" }],
  ["radius", 6],
];

let counter = 0;
const fresh = (prefix: string) => `${prefix}${++counter}`;

function textNode(id: string): Node {
  return { id, type: "text", name: "", tag: "p", style: { desktop: {} }, content: [{ text: id }] };
}

export function makeOp(doc: ProjectDocument, c: Choice): Op {
  const nodes = Object.values(doc.nodes);
  const containers = nodes.filter((n) => n.type === "frame" || n.type === "link");
  const anyNode = pick(nodes, c.a) as Node;
  const parent = pick(containers, c.b) as Node;
  const slot = (n: Node) => c.c % (childrenOf(n).length + 2); // sometimes out of range
  switch (c.kind) {
    case 0: {
      const id = fresh("n");
      const nodesToInsert: Node[] =
        c.d % 2
          ? [textNode(id)]
          : [
              {
                id,
                type: "frame",
                name: "Group",
                tag: "div",
                style: { desktop: {} },
                children: [`${id}t`],
              },
              textNode(`${id}t`),
            ];
      return { op: "insertNodes", parentId: parent.id, index: slot(parent), nodes: nodesToInsert };
    }
    case 1:
      return { op: "deleteNode", nodeId: anyNode.id };
    case 2:
      return { op: "moveNode", nodeId: anyNode.id, parentId: parent.id, index: slot(parent) };
    case 3: {
      const [key, value] = pick(PROP_VALUES, c.b) as [string, unknown];
      return {
        op: "setProp",
        nodeId: anyNode.id,
        breakpoint: pick(BREAKPOINT_IDS, c.c) as "desktop",
        key: key as "gap",
        value,
      };
    }
    case 4: {
      const [key] = pick(PROP_VALUES, c.b) as [string, unknown];
      return {
        op: "resetProp",
        nodeId: anyNode.id,
        breakpoint: pick(BREAKPOINT_IDS, c.c) as "desktop",
        key: key as "gap",
      };
    }
    case 5: {
      const fields = [
        { name: `Layer ${c.d % 7}` },
        { tag: pick(["p", "h2", "section", "div", "a"], c.d) },
        { hidden: c.d % 2 ? { mobile: true } : null },
        { content: [{ text: `Text ${c.d}` }] },
        { ariaLabel: c.d % 2 ? "Label" : null },
        { alt: "Alt" },
      ];
      return {
        op: "setNodeFields",
        nodeId: anyNode.id,
        fields: pick(fields, c.b) as Record<string, unknown>,
      };
    }
    case 6: {
      // Aim at an instance when there is one: a random node almost never is, and the op would
      // then be rarely applied at all.
      const instances = nodes.filter((n) => n.type === "instance");
      const target = c.a % 4 === 0 || !instances.length ? anyNode : (pick(instances, c.a) as Node);
      const kind = pick(["variant", "props", "nodes"] as const, c.b) ?? "props";
      const values: readonly unknown[] = {
        variant: ["default", "large", "huge"],
        props: ["Hello", null, true],
        nodes: [{ alt: "x" }, { hidden: { tablet: true } }],
      }[kind];
      const key = pick(
        { variant: ["size"], props: ["title", "showTitle"], nodes: ["cardTitle", "title"] }[kind],
        c.c,
      ) as string;
      return c.d % 4 === 0
        ? { op: "setInstanceOverride", nodeId: target.id, kind, key }
        : { op: "setInstanceOverride", nodeId: target.id, kind, key, value: pick(values, c.d) };
    }
    case 7: {
      const id = fresh("p");
      return {
        op: "addPage",
        index: c.b % (doc.pages.length + 2),
        page: {
          id,
          name: "Page",
          path: c.c % 5 ? `/${id}` : "/about",
          seo: { title: "", description: "", ogImage: null, noindex: false },
          root: `${id}body`,
        },
        nodes: [
          {
            id: `${id}body`,
            type: "frame",
            name: "Body",
            tag: "main",
            style: { desktop: {} },
            children: [],
          },
        ],
      };
    }
    case 8:
      return { op: "deletePage", pageId: (pick(doc.pages, c.a) as { id: string }).id };
    case 9:
      return {
        op: "updatePage",
        pageId: (pick(doc.pages, c.a) as { id: string }).id,
        fields:
          c.b % 2
            ? { name: `Renamed ${c.c % 9}` }
            : { path: pick(["/", "/x", "/about", "/y-z"], c.c) as string },
      };
    case 10:
      return {
        op: "movePage",
        pageId: (pick(doc.pages, c.a) as { id: string }).id,
        index: c.b % (doc.pages.length + 1),
      };
    case 11: {
      const bp = pick(BREAKPOINT_IDS, c.a) ?? "tablet";
      const widths = {
        desktop: [1200, 1440, 1100],
        tablet: [810, 600, 1199, 500],
        mobile: [390, 320, 599, 700],
      }[bp];
      return {
        op: "setBreakpoint",
        breakpoint: bp,
        width: c.b % 4 === 0 ? null : (pick(widths, c.c) as number),
      };
    }
    case 12:
      return c.b % 2
        ? { op: "deleteVariable", variableId: pick(Object.keys(doc.variables), c.c) ?? "none" }
        : {
            op: "upsertVariable",
            variable: {
              id: `v${c.c % 3}`,
              name: "V",
              group: "G",
              cssName: `--g-v${c.c % 3}`,
              type: "spacing",
              value: { desktop: c.d % 64 },
            },
          };
    case 13: {
      const id = fresh("c");
      return {
        op: "addComponent",
        component: {
          id,
          name: `Part${c.a % 3}`,
          root: `${id}root`,
          props: [],
          variantProps: [],
          variants: {},
        },
        nodes: [
          {
            id: `${id}root`,
            type: "frame",
            name: "Root",
            tag: "div",
            style: { desktop: {} },
            children: [`${id}t`],
          },
          textNode(`${id}t`),
        ],
      };
    }
    case 14: {
      const comp = pick(Object.values(doc.components), c.a);
      const fields = [
        { name: `Renamed${c.c % 4}` },
        { name: "lowercase" },
        { variantProps: [{ name: "size", values: ["small", "large"], default: "small" }] },
        { variantProps: [] },
        { props: [] },
      ];
      return {
        op: "updateComponent",
        componentId: comp?.id ?? "none",
        fields: pick(fields, c.b) as Record<string, unknown>,
      };
    }
    case 15:
      return {
        op: "deleteComponent",
        componentId: pick(Object.keys(doc.components), c.a) ?? "none",
      };
    default:
      return {
        op: "setSettings",
        settings: { lang: pick(["en", "de", "pt-BR", "x!"], c.a) as string },
      };
  }
}

export const startDocs = (): ProjectDocument[] => [
  kitchenSink(),
  ...TEMPLATES.map((t) =>
    templateDocument(t.id, { projectId: FIXTURE_PROJECT_ID, framework: "astro" }),
  ),
];

/** Builds one transaction's ops; each op is made against the doc the previous ones produce. */
export function transactionOps(
  doc: ProjectDocument,
  choices: readonly Choice[],
  limits: OpLimits,
): Op[] {
  const ops: Op[] = [];
  let preview = doc;
  for (const c of choices) {
    const op = makeOp(preview, c);
    ops.push(op);
    const step = applyTransaction(preview, [op], limits);
    if (step.ok) preview = step.doc;
  }
  return ops;
}
