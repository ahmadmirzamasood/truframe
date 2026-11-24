/**
 * Every Design View command (P4-10). Shortcuts, the Cmd+K palette and the shortcut sheet all
 * come from this list, so adding an action here makes it reachable everywhere.
 */
import {
  activeBreakpoints,
  type BreakpointId,
  childrenOf,
  type Node,
  newId,
  type ProjectDocument,
} from "@truframe/model";
import type { Op } from "@truframe/ops";
import type { CanvasApi } from "./canvas.tsx";
import type { Command } from "./commands.ts";
import { deleteOps, duplicateOps, isAbsolute, reorderOps } from "./gestures.ts";
import { INSERT_LABEL, INSERT_SHORTCUT, INSERT_TOOLS, type InsertTool } from "./insert.ts";
import { BREAKPOINT_LABEL } from "./labels.ts";
import { addPageOps } from "./pages.ts";
import type { LeftTab, RightTab } from "./panels.tsx";
import { parentMap } from "./tree.ts";

export type CommandContext = {
  doc: ProjectDocument | null;
  pageRoot: string | null;
  selection: string[];
  editing: BreakpointId;
  apply: (ops: Op[]) => { message: string } | null;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  setSelection: (ids: string[]) => void;
  setBreakpoint: (bp: BreakpointId) => void;
  setView: (v: "design" | "code") => void;
  setLeftTab: (t: LeftTab) => void;
  setRightTab: (t: RightTab) => void;
  openPage: (id: string) => void;
  insert: (tool: InsertTool) => void;
  canvas: { current: CanvasApi | null };
  openPalette: () => void;
  openShortcuts: () => void;
};

export function editorCommands(ctx: CommandContext): Command[] {
  const { doc, selection } = ctx;
  const parents = doc ? parentMap(doc) : new Map<string, string>();
  const has = () => Boolean(doc) && selection.length > 0;
  const single = () => (doc && selection.length === 1 ? (selection[0] as string) : null);

  const move = (dir: -1 | 1) => {
    const id = single();
    const parentId = id ? parents.get(id) : undefined;
    if (!doc || !id || !parentId) return;
    const others = childrenOf(doc.nodes[parentId] as Node).filter((c) => c !== id);
    const at = childrenOf(doc.nodes[parentId] as Node).indexOf(id) + dir;
    if (at < 0 || at > others.length) return;
    ctx.apply(reorderOps(doc, parents, [id], parentId, at));
  };

  const commands: Command[] = [
    {
      id: "undo",
      title: "Undo",
      group: "Edit",
      shortcuts: ["Mod+Z"],
      enabled: () => ctx.canUndo,
      run: ctx.undo,
    },
    {
      id: "redo",
      title: "Redo",
      group: "Edit",
      shortcuts: ["Mod+Shift+Z", "Mod+Y"],
      enabled: () => ctx.canRedo,
      run: ctx.redo,
    },
    {
      id: "delete",
      title: "Delete selection",
      group: "Edit",
      shortcuts: ["Delete", "Backspace"],
      enabled: has,
      run: () => {
        if (!doc) return;
        const ops = deleteOps(selection, parents);
        if (ops.length && !ctx.apply(ops)) ctx.setSelection([]);
      },
    },
    {
      id: "duplicate",
      title: "Duplicate selection",
      group: "Edit",
      shortcuts: ["Mod+D"],
      enabled: has,
      run: () => {
        if (!doc) return;
        const { ops, copies } = duplicateOps(doc, parents, selection, newId);
        if (ops.length && !ctx.apply(ops)) ctx.setSelection(copies);
      },
    },
    {
      id: "select-parent",
      title: "Select parent",
      group: "Select",
      shortcuts: ["Escape"],
      enabled: has,
      run: () => {
        const parent = parents.get(selection[0] as string);
        ctx.setSelection(parent && parent !== ctx.pageRoot ? [parent] : []);
      },
    },
    {
      id: "select-children",
      title: "Select children",
      group: "Select",
      shortcuts: ["Enter"],
      enabled: () => {
        const id = single();
        return Boolean(id && doc && childrenOf(doc.nodes[id] as Node).length);
      },
      run: () => ctx.setSelection([...childrenOf(doc?.nodes[single() as string] as Node)]),
    },
    {
      id: "select-none",
      title: "Select nothing",
      group: "Select",
      enabled: has,
      run: () => ctx.setSelection([]),
    },
    ...INSERT_TOOLS.map(
      (tool): Command => ({
        id: `insert-${tool}`,
        title: `Insert ${INSERT_LABEL[tool]}`,
        group: "Insert",
        shortcuts: INSERT_SHORTCUT[tool] ? [INSERT_SHORTCUT[tool] as string] : undefined,
        enabled: () => Boolean(doc && ctx.pageRoot),
        run: () => ctx.insert(tool),
      }),
    ),
    {
      id: "move-up",
      title: "Move up",
      group: "Arrange",
      shortcuts: ["Alt+ArrowUp"],
      enabled: () => Boolean(single()),
      run: () => move(-1),
    },
    {
      id: "move-down",
      title: "Move down",
      group: "Arrange",
      shortcuts: ["Alt+ArrowDown"],
      enabled: () => Boolean(single()),
      run: () => move(1),
    },
    {
      id: "toggle-absolute",
      title: "Toggle absolute position",
      group: "Arrange",
      enabled: () => Boolean(single() && single() !== ctx.pageRoot),
      run: () => {
        const id = single();
        if (!doc || !id) return;
        // Turning absolute on needs the rendered box; the inspector's Position switch does it.
        if (isAbsolute(doc, id, ctx.editing))
          ctx.apply([
            { op: "setProp", nodeId: id, breakpoint: ctx.editing, key: "position", value: "auto" },
          ]);
        else ctx.setRightTab("inspect");
      },
    },
    {
      id: "zoom-in",
      title: "Zoom in",
      group: "View",
      shortcuts: ["Mod+Plus"],
      run: () => ctx.canvas.current?.zoomIn(),
    },
    {
      id: "zoom-out",
      title: "Zoom out",
      group: "View",
      shortcuts: ["Mod+Minus"],
      run: () => ctx.canvas.current?.zoomOut(),
    },
    {
      id: "zoom-fit",
      title: "Zoom to fit",
      group: "View",
      shortcuts: ["Shift+1"],
      run: () => ctx.canvas.current?.fit(),
    },
    {
      id: "zoom-100",
      title: "Zoom to 100%",
      group: "View",
      shortcuts: ["Shift+0", "Mod+0"],
      run: () => ctx.canvas.current?.zoomTo(1),
    },
    { id: "view-design", title: "Design view", group: "View", run: () => ctx.setView("design") },
    { id: "view-code", title: "Code view", group: "View", run: () => ctx.setView("code") },
    ...(doc ? activeBreakpoints(doc.breakpoints) : (["desktop"] as BreakpointId[])).map(
      (bp, i): Command => ({
        id: `edit-${bp}`,
        title: `Edit ${BREAKPOINT_LABEL[bp]}`,
        group: "View",
        shortcuts: [`Alt+${i + 1}`],
        run: () => ctx.setBreakpoint(bp),
      }),
    ),
    ...(["pages", "layers", "components", "variables", "assets"] as const).map(
      (t): Command => ({
        id: `panel-${t}`,
        title: `Show ${t[0]?.toUpperCase()}${t.slice(1)}`,
        group: "View",
        run: () => ctx.setLeftTab(t),
      }),
    ),
    ...(["inspect", "agent", "history", "comments"] as const).map(
      (t): Command => ({
        id: `panel-${t}`,
        title: `Show ${t[0]?.toUpperCase()}${t.slice(1)}`,
        group: "View",
        run: () => ctx.setRightTab(t),
      }),
    ),
    {
      id: "add-page",
      title: "Add page",
      group: "Pages",
      enabled: () => Boolean(doc),
      run: () => {
        if (!doc) return;
        const r = addPageOps(doc, "New page");
        if (!ctx.apply(r.ops)) {
          ctx.openPage(r.pageId);
          ctx.setLeftTab("pages");
        }
      },
    },
    {
      id: "palette",
      title: "Command palette",
      group: "Help",
      shortcuts: ["Mod+K"],
      inInputs: true,
      run: ctx.openPalette,
    },
    {
      id: "shortcuts",
      title: "Keyboard shortcuts",
      group: "Help",
      shortcuts: ["?", "Mod+/"],
      run: ctx.openShortcuts,
    },
  ];
  return commands;
}
