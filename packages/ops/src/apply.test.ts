import { type Node, type ProjectDocument, templateDocument } from "@truframe/model";
import { FIXTURE_PROJECT_ID, kitchenSink } from "@truframe/model/testing";
import { describe, expect, it } from "vitest";
import { type ApplyResult, applyTransaction } from "./apply.ts";
import type { Op } from "./ops.ts";
import { canonical } from "./testing.ts";

const limits = { pagesPerProject: 5 };

function ok(r: ApplyResult): Extract<ApplyResult, { ok: true }> {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r;
}

function error(r: ApplyResult) {
  if (r.ok) throw new Error("expected the transaction to fail");
  return r.error;
}

/** Applies, checks the result is valid, then checks undo and redo round-trip exactly. */
function roundTrip(doc: ProjectDocument, ops: unknown[]): ProjectDocument {
  const before = canonical(doc);
  const done = ok(applyTransaction(doc, ops, limits));
  expect(canonical(doc)).toBe(before);
  const undone = ok(applyTransaction(done.doc, done.inverse, limits));
  expect(canonical(undone.doc)).toBe(before);
  const redone = ok(applyTransaction(undone.doc, undone.inverse, limits));
  expect(canonical(redone.doc)).toBe(canonical(done.doc));
  return done.doc;
}

const text = (id: string, words: string): Node => ({
  id,
  type: "text",
  name: "",
  tag: "p",
  style: { desktop: {} },
  content: [{ text: words }],
});

describe("node ops", () => {
  it("inserts a subtree and deletes it", () => {
    const doc = kitchenSink();
    const frame: Node = {
      id: "box",
      type: "frame",
      name: "Box",
      tag: "div",
      style: { desktop: {} },
      children: ["t1"],
    };
    const after = roundTrip(doc, [
      { op: "insertNodes", parentId: "hero", index: 1, nodes: [frame, text("t1", "Hi")] },
    ]);
    expect((after.nodes.hero as { children: string[] }).children[1]).toBe("box");
    const deleted = roundTrip(after, [{ op: "deleteNode", nodeId: "box" }]);
    expect(deleted.nodes.t1).toBeUndefined();
  });

  it("sets, changes and removes an animation with undo, and refuses invalid ones", () => {
    const doc = kitchenSink();
    const anim = {
      trigger: "load",
      from: { opacity: 0, y: 24 },
      duration: 600,
      delay: 0,
      easing: "ease-out",
      once: true,
      disabledOn: ["mobile"],
    };
    const set = roundTrip(doc, [
      { op: "setNodeFields", nodeId: "title", fields: { animation: anim } },
    ]);
    expect(set.nodes.title?.animation).toEqual(anim);
    const changed = roundTrip(set, [
      { op: "setNodeFields", nodeId: "title", fields: { animation: { ...anim, trigger: "loop" } } },
    ]);
    expect(changed.nodes.title?.animation?.trigger).toBe("loop");
    const removed = roundTrip(changed, [
      { op: "setNodeFields", nodeId: "title", fields: { animation: null } },
    ]);
    expect(removed.nodes.title && "animation" in removed.nodes.title).toBe(false);
    expect(
      error(
        applyTransaction(
          doc,
          [
            {
              op: "setNodeFields",
              nodeId: "title",
              fields: { animation: { ...anim, duration: 0 } },
            },
          ],
          limits,
        ),
      ).code,
    ).toBe("INVALID_OP");
    expect(
      error(
        applyTransaction(
          doc,
          [
            {
              op: "setNodeFields",
              nodeId: "title",
              fields: { animation: { ...anim, staggerChildren: 80 } },
            },
          ],
          limits,
        ),
      ).code,
    ).toBe("INVALID_DOCUMENT");
  });

  it("moves a node within and between parents", () => {
    const doc = kitchenSink();
    const within = roundTrip(doc, [
      { op: "moveNode", nodeId: "title", parentId: "hero", index: 2 },
    ]);
    expect((within.nodes.hero as { children: string[] }).children.slice(0, 3)).toEqual([
      "pic",
      "cta",
      "title",
    ]);
    const across = roundTrip(doc, [
      { op: "moveNode", nodeId: "title", parentId: "aboutBody", index: 0 },
    ]);
    expect((across.nodes.aboutBody as { children: string[] }).children).toEqual(["title"]);
  });

  it("refuses to move a node into itself or delete a page root", () => {
    const doc = kitchenSink();
    expect(
      error(
        applyTransaction(
          doc,
          [{ op: "moveNode", nodeId: "hero", parentId: "hero", index: 0 }],
          limits,
        ),
      ).message,
    ).toMatch(/into itself/);
    expect(
      error(applyTransaction(doc, [{ op: "deleteNode", nodeId: "aboutBody" }], limits)).message,
    ).toMatch(/page or component root/);
    expect(
      error(
        applyTransaction(
          doc,
          [{ op: "insertNodes", parentId: "title", index: 0, nodes: [text("x", "x")] }],
          limits,
        ),
      ).message,
    ).toMatch(/can't contain/);
  });

  it("sets and resets props per breakpoint, leaving no empty overrides behind", () => {
    const doc = kitchenSink();
    expect(doc.nodes.title?.style.tablet).toBeUndefined();
    const set = roundTrip(doc, [
      { op: "setProp", nodeId: "title", breakpoint: "tablet", key: "fontSize", value: 32 },
    ]);
    expect(set.nodes.title?.style.tablet).toEqual({ fontSize: 32 });
    const reset = roundTrip(set, [
      { op: "resetProp", nodeId: "title", breakpoint: "tablet", key: "fontSize" },
    ]);
    expect(reset.nodes.title?.style.tablet).toBeUndefined();
    roundTrip(doc, [
      { op: "setProp", nodeId: "hero", breakpoint: "desktop", key: "gap", value: { var: "space" } },
    ]);
  });

  it("checks prop values and variable types", () => {
    const doc = kitchenSink();
    const bad = (value: unknown, key = "fontSize") =>
      error(
        applyTransaction(
          doc,
          [{ op: "setProp", nodeId: "title", breakpoint: "desktop", key, value }],
          limits,
        ),
      );
    expect(bad(-5).code).toBe("INVALID_OP");
    expect(bad("#FFF", "textColor").code).toBe("INVALID_OP");
    expect(bad(1, "colour").code).toBe("INVALID_OP");
    expect(bad({ var: "space" }, "textColor").code).toBe("INVALID_DOCUMENT");
  });

  it("changes node fields and removes optional ones with null", () => {
    const doc = kitchenSink();
    const renamed = roundTrip(doc, [
      { op: "setNodeFields", nodeId: "mail", fields: { name: "Email", ariaLabel: null, tag: "a" } },
    ]);
    expect(renamed.nodes.mail).toMatchObject({ name: "Email", tag: "a" });
    expect(renamed.nodes.mail).not.toHaveProperty("ariaLabel");
    roundTrip(doc, [
      {
        op: "setNodeFields",
        nodeId: "title",
        fields: { content: [{ text: "New" }], hidden: { mobile: true } },
      },
    ]);
    expect(
      error(
        applyTransaction(
          doc,
          [{ op: "setNodeFields", nodeId: "title", fields: { tag: "img" } }],
          limits,
        ),
      ).code,
    ).toBe("INVALID_OP");
    expect(
      error(
        applyTransaction(
          doc,
          [{ op: "setNodeFields", nodeId: "title", fields: { type: "frame" } }],
          limits,
        ),
      ).code,
    ).toBe("INVALID_OP");
  });

  it("sets and removes instance overrides", () => {
    const doc = kitchenSink();
    roundTrip(doc, [
      { op: "setInstanceOverride", nodeId: "card", kind: "variant", key: "size", value: "default" },
    ]);
    roundTrip(doc, [{ op: "setInstanceOverride", nodeId: "card", kind: "props", key: "title" }]);
    roundTrip(doc, [
      {
        op: "setInstanceOverride",
        nodeId: "card",
        kind: "nodes",
        key: "cardTitle",
        value: { alt: "x" },
      },
    ]);
    expect(
      error(
        applyTransaction(
          doc,
          [
            {
              op: "setInstanceOverride",
              nodeId: "card",
              kind: "variant",
              key: "size",
              value: "huge",
            },
          ],
          limits,
        ),
      ).code,
    ).toBe("INVALID_DOCUMENT");
  });
});

describe("page, breakpoint, variable and settings ops", () => {
  const blogPage = (path = "/blog"): Op => ({
    op: "addPage",
    index: 1,
    page: {
      id: "blog",
      name: "Blog",
      path,
      seo: { title: "Blog", description: "", ogImage: null, noindex: false },
      root: "blogBody",
    },
    nodes: [
      {
        id: "blogBody",
        type: "frame",
        name: "Body",
        tag: "main",
        style: { desktop: {} },
        children: ["blogTitle"],
      },
      text("blogTitle", "Blog"),
    ],
  });

  it("adds, updates, moves and deletes pages", () => {
    const doc = kitchenSink();
    const added = roundTrip(doc, [blogPage()]);
    expect(added.pages.map((p) => p.path)).toEqual(["/", "/blog", "/about"]);
    roundTrip(added, [
      { op: "updatePage", pageId: "blog", fields: { name: "Journal", path: "/journal" } },
    ]);
    roundTrip(added, [{ op: "movePage", pageId: "blog", index: 2 }]);
    roundTrip(added, [{ op: "deletePage", pageId: "blog" }]);
  });

  it("refuses a duplicate path, deleting the home page or a page that links point at", () => {
    const doc = kitchenSink();
    expect(error(applyTransaction(doc, [blogPage("/about")], limits)).code).toBe(
      "INVALID_DOCUMENT",
    );
    expect(
      error(applyTransaction(doc, [{ op: "deletePage", pageId: doc.pages[0]?.id }], limits)).code,
    ).toBe("INVALID_DOCUMENT");
    expect(
      error(applyTransaction(doc, [{ op: "deletePage", pageId: "about" }], limits)).message,
    ).toMatch(/Unknown page "about"/);
  });

  it("enforces the plan's page limit on growth only", () => {
    const doc = kitchenSink();
    const err = error(applyTransaction(doc, [blogPage()], { pagesPerProject: 2 }));
    expect(err.code).toBe("LIMIT_REACHED");
    // A project already over the limit (after a downgrade) can still be edited.
    ok(
      applyTransaction(doc, [{ op: "setSettings", settings: { lang: "de" } }], {
        pagesPerProject: 1,
      }),
    );
  });

  it("sets, removes and re-adds breakpoints within their ranges", () => {
    const doc = kitchenSink();
    const wide = roundTrip(doc, [{ op: "setBreakpoint", breakpoint: "desktop", width: 1440 }]);
    expect(wide.breakpoints.desktop.width).toBe(1440);
    const noTablet = roundTrip(doc, [{ op: "setBreakpoint", breakpoint: "tablet", width: null }]);
    expect(noTablet.breakpoints.tablet).toBeUndefined();
    // Overrides for a removed breakpoint stay, inactive, and apply again when it's re-added.
    expect(noTablet.nodes.hero?.style.tablet).toBeDefined();
    roundTrip(noTablet, [{ op: "setBreakpoint", breakpoint: "tablet", width: 700 }]);
    expect(
      error(
        applyTransaction(
          doc,
          [{ op: "setBreakpoint", breakpoint: "desktop", width: null }],
          limits,
        ),
      ).message,
    ).toMatch(/Desktop can't be removed/);
    expect(
      error(
        applyTransaction(
          doc,
          [{ op: "setBreakpoint", breakpoint: "desktop", width: 1000 }],
          limits,
        ),
      ).code,
    ).toBe("INVALID_DOCUMENT");
    expect(
      error(
        applyTransaction(doc, [{ op: "setBreakpoint", breakpoint: "mobile", width: 700 }], limits),
      ).code,
    ).toBe("INVALID_DOCUMENT");
  });

  it("upserts and deletes variables, refusing to delete one in use", () => {
    const doc = kitchenSink();
    roundTrip(doc, [
      {
        op: "upsertVariable",
        variable: {
          id: "gray",
          name: "Gray",
          group: "Colors",
          cssName: "--colors-gray",
          type: "color",
          value: { desktop: "#888888" },
        },
      },
    ]);
    roundTrip(doc, [
      {
        op: "upsertVariable",
        variable: { ...(doc.variables.brand as object), value: { desktop: "#0000ff" } },
      },
    ]);
    expect(
      error(applyTransaction(doc, [{ op: "deleteVariable", variableId: "brand" }], limits)).message,
    ).toMatch(/Unknown variable "brand"/);
  });

  it("changes settings", () => {
    roundTrip(kitchenSink(), [{ op: "setSettings", settings: { lang: "fr-CA" } }]);
  });
});

describe("transactions", () => {
  it("applies all ops or none", () => {
    const doc = kitchenSink();
    const before = canonical(doc);
    const err = error(
      applyTransaction(
        doc,
        [
          { op: "setNodeFields", nodeId: "title", fields: { name: "Changed" } },
          { op: "deleteNode", nodeId: "nope" },
        ],
        limits,
      ),
    );
    expect(err).toMatchObject({ code: "NOT_FOUND", opIndex: 1 });
    expect(canonical(doc)).toBe(before);
  });

  it("undoes a multi-op transaction in one step", () => {
    const doc = templateDocument("landing", { projectId: FIXTURE_PROJECT_ID, framework: "nextjs" });
    const body = doc.pages[0]?.root as string;
    roundTrip(doc, [
      { op: "insertNodes", parentId: body, index: 0, nodes: [text("a", "A")] },
      { op: "setProp", nodeId: "a", breakpoint: "desktop", key: "fontSize", value: 20 },
      { op: "setProp", nodeId: "a", breakpoint: "mobile", key: "fontSize", value: 14 },
      { op: "moveNode", nodeId: "a", parentId: body, index: 2 },
      { op: "setNodeFields", nodeId: "a", fields: { tag: "h2" } },
    ]);
  });

  it("returns the parsed ops unchanged by later ops in the transaction", () => {
    const doc = kitchenSink();
    const r = ok(
      applyTransaction(
        doc,
        [
          {
            op: "addPage",
            index: 1,
            page: {
              id: "p",
              name: "P",
              path: "/p",
              seo: { title: "", description: "", ogImage: null, noindex: false },
              root: "pBody",
            },
            nodes: [
              {
                id: "pBody",
                type: "frame",
                name: "Body",
                tag: "main",
                style: { desktop: {} },
                children: [],
              },
            ],
          },
          { op: "insertNodes", parentId: "pBody", index: 0, nodes: [text("pText", "Hi")] },
          { op: "updatePage", pageId: "p", fields: { name: "Renamed" } },
        ],
        limits,
      ),
    );
    expect(r.ops[0]).toMatchObject({ page: { name: "P" }, nodes: [{ children: [] }] });
  });

  it("rejects malformed ops with their index", () => {
    const err = error(
      applyTransaction(
        kitchenSink(),
        [{ op: "setSettings", settings: { lang: "en" } }, { op: "explode" }],
        limits,
      ),
    );
    expect(err).toMatchObject({ code: "INVALID_OP", opIndex: 1 });
  });
});
