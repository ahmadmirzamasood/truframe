import { childrenOf, type Node, templateDocument } from "@truframe/model";
import { applyTransaction, type Op } from "@truframe/ops";
import { describe, expect, it } from "vitest";
import { parseShortcut } from "./commands.ts";
import { type CommandContext, editorCommands } from "./editor-commands.ts";

function context(over: Partial<CommandContext> = {}): CommandContext & { applied: Op[][] } {
  const doc = templateDocument("landing", {
    projectId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
    framework: "nextjs",
  });
  const applied: Op[][] = [];
  const noop = () => {};
  return {
    doc,
    pageRoot: doc.pages[0]?.root ?? null,
    selection: [],
    editing: "desktop",
    apply: (ops) => {
      applied.push(ops);
      const r = applyTransaction(doc, ops, { pagesPerProject: 100 });
      return r.ok ? null : { message: r.error.message };
    },
    undo: noop,
    redo: noop,
    canUndo: true,
    canRedo: false,
    setSelection: noop,
    setBreakpoint: noop,
    setView: noop,
    setLeftTab: noop,
    setRightTab: noop,
    openPage: noop,
    insert: noop,
    canvas: { current: null },
    openPalette: noop,
    openShortcuts: noop,
    applied,
    ...over,
  };
}

describe("editor commands", () => {
  it("registers every editor action once, with no clashing shortcuts", () => {
    const commands = editorCommands(context());
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      "undo",
      "redo",
      "delete",
      "duplicate",
      "select-parent",
      "select-children",
      "select-none",
      "insert-stack",
      "insert-grid",
      "insert-text",
      "insert-image",
      "insert-button",
      "insert-icon",
      "move-up",
      "move-down",
      "add-auto-layout",
      "group-stack",
      "toggle-absolute",
      "zoom-in",
      "zoom-out",
      "zoom-fit",
      "zoom-100",
      "view-design",
      "view-code",
      "edit-desktop",
      "edit-tablet",
      "edit-mobile",
      "panel-pages",
      "panel-layers",
      "panel-inspect",
      "add-page",
      "palette",
      "shortcuts",
    ])
      expect(ids).toContain(id);
    const seen = new Map<string, string>();
    for (const c of commands)
      for (const s of c.shortcuts ?? []) {
        const p = parseShortcut(s);
        const key = `${p.mod}${p.shift}${p.alt}${p.key.toLowerCase()}`;
        expect(seen.get(key), `${s} used by ${seen.get(key)} and ${c.id}`).toBeUndefined();
        seen.set(key, c.id);
      }
  });

  it("disables selection commands with nothing selected and runs them with a selection", () => {
    const empty = editorCommands(context());
    expect(empty.find((c) => c.id === "delete")?.enabled?.()).toBe(false);
    const ctx = context();
    const sections = childrenOf(ctx.doc?.nodes[ctx.pageRoot as string] as Node);
    const commands = editorCommands({ ...ctx, selection: [sections[1] as string] });
    commands.find((c) => c.id === "move-up")?.run();
    commands.find((c) => c.id === "duplicate")?.run();
    expect(ctx.applied).toHaveLength(2);
    expect(ctx.applied[0]).toEqual([
      { op: "moveNode", nodeId: sections[1], parentId: ctx.pageRoot, index: 0 },
    ]);
    expect(ctx.applied[1]?.[0]).toMatchObject({
      op: "insertNodes",
      parentId: ctx.pageRoot,
      index: 2,
    });
  });
});
