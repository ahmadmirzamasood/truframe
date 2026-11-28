"use client";

import { type BreakpointId, newId } from "@truframe/model";
import type { Op } from "@truframe/ops";
import { RenderedFrame } from "@truframe/renderer";
import { type ComponentType, type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { imageNodeFor } from "./assets.ts";
import { AssetsPanel } from "./assets-panel.tsx";
import { Canvas, type CanvasApi } from "./canvas.tsx";
import { CommandPalette, ShortcutSheet, useCommandKeys } from "./command-ui.tsx";
import {
  createComponentOps,
  defaultVariantKey,
  deleteComponentOps,
  mainComponentView,
  newInstance,
  renameComponentOps,
  routeToVariant,
  variantKey,
} from "./components.ts";
import { ComponentsPanel } from "./components-panel.tsx";
import { editorCommands } from "./editor-commands.ts";
import { useGuides } from "./guides.ts";
import type { EditorHost } from "./host.ts";
import { createNodes, type InsertTool, insertOps, insertTarget } from "./insert.ts";
import { InsertToolbar } from "./insert-toolbar.tsx";
import type { ComponentActions } from "./inspector/component-sections.tsx";
import { Inspector } from "./inspector/inspector.tsx";
import { LayersPanel, useLocks } from "./layers-panel.tsx";
import { PagesPanel } from "./pages-panel.tsx";
import { ComingSoon, LeftPanel, type LeftTab, RightPanel, type RightTab } from "./panels.tsx";
import { SelectionLayer } from "./selection-layer.tsx";
import { VariablesPanel } from "./variables-panel.tsx";

const EMPTY_CLASSES: ReadonlyMap<string, string> = new Map();

import { type EditorView, TopBar } from "./top-bar.tsx";
import { useCompiled } from "./use-compiled.ts";

export type DesignEditorProps = {
  host: EditorHost;
  backHref: string;
  /** The app's link component (next/link), so the editor stays framework-neutral. */
  Link: ComponentType<{ href: string; className?: string; children: ReactNode }>;
};

export function DesignEditor({ host, backHref, Link }: DesignEditorProps) {
  const realDoc = host.doc;
  /** The main component being edited on the canvas, and the variant shown. */
  const [editingMain, setEditingMain] = useState<{
    componentId: string;
    variantKey: string;
  } | null>(null);
  const [componentError, setComponentError] = useState<string | null>(null);
  const main = realDoc && editingMain ? realDoc.components[editingMain.componentId] : undefined;
  // A variant key that no longer exists (its values changed) falls back to the default.
  const mainKey = main
    ? variantKey(
        main,
        Object.fromEntries(
          (editingMain?.variantKey ?? "")
            .split(",")
            .map((p) => p.split("=") as [string, string])
            .filter(([k, v]) =>
              main.variantProps.some((vp) => vp.name === k && vp.values.includes(v)),
            ),
        ),
      )
    : "";
  const mainId = main?.id ?? null;
  const viewDoc = useMemo(
    () => (realDoc && mainId ? mainComponentView(realDoc, mainId, mainKey) : null),
    [realDoc, mainId, mainKey],
  );
  /** What the canvas and panels show: the page, or the main component being edited. */
  const doc = viewDoc ?? realDoc;
  /** Style edits while a variant is edited become that variant's overrides. */
  const apply = useCallback(
    (ops: Op[]) =>
      host.apply(realDoc && mainId ? routeToVariant(realDoc, mainId, mainKey, ops) : ops),
    [host, realDoc, mainId, mainKey],
  );
  const [pageId, setPageId] = useState<string | null>(null);
  const [view, setView] = useState<EditorView>("design");
  const [breakpoint, setBreakpoint] = useState<BreakpointId>("desktop");
  const [leftTab, setLeftTab] = useState<LeftTab>("layers");
  const [rightTab, setRightTab] = useState<RightTab>("inspect");
  /** Selected layer ids; the last one is the focus (P4-6 adds pointer selection). */
  const [selection, setSelection] = useState<string[]>([]);
  /** Column guides per breakpoint: a design aid, not part of the site. */
  const [guides, setGuides] = useGuides(realDoc?.id);

  // Follow the document: keep the active page if it still exists, otherwise show the first.
  const activePageId =
    doc && pageId && doc.pages.some((p) => p.id === pageId) ? pageId : (doc?.pages[0]?.id ?? null);
  const activeBreakpoint = doc?.breakpoints[breakpoint] ? breakpoint : "desktop";

  const page = doc?.pages.find((p) => p.id === activePageId);
  const compiled = useCompiled(doc);
  const locks = useLocks(doc?.id);
  // Layers removed by undo or by someone else drop out of the selection.
  const liveSelection = useMemo(
    () => (doc ? selection.filter((id) => doc.nodes[id]) : []),
    [doc, selection],
  );
  const output = compiled.status === "loading" ? null : compiled.output;
  // Images on the canvas load from the app (authorized); one URL per asset and width bucket.
  const assetHost = host.assets;
  const treeOptions = useMemo(
    () => ({
      assetUrl: (id: string) => {
        const a = doc?.assets[id];
        return a && assetHost ? assetHost.url(a, Math.min(a.width, 1920)) : null;
      },
    }),
    [doc, assetHost],
  );

  const insert = useCallback(
    (tool: InsertTool) => {
      if (!doc || !page) return;
      const nodes = createNodes(tool);
      const target = insertTarget(doc, main?.root ?? page.root, liveSelection.at(-1) ?? null, tool);
      const failure = apply(insertOps(nodes, target));
      if (!failure && nodes[0]) setSelection([nodes[0].id]);
    },
    [doc, page, liveSelection, apply, main],
  );

  const canvasApi = useRef<CanvasApi | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const commands = useMemo(
    () =>
      editorCommands({
        doc,
        pageRoot: page?.root ?? null,
        selection: liveSelection,
        editing: activeBreakpoint,
        apply,
        undo: host.undo,
        redo: host.redo,
        canUndo: host.sync.canUndo,
        canRedo: host.sync.canRedo,
        setSelection,
        setBreakpoint,
        setView,
        setLeftTab,
        setRightTab,
        openPage: (id) => {
          setPageId(id);
          setSelection([]);
        },
        insert,
        canvas: canvasApi,
        openPalette: () => setPaletteOpen(true),
        openShortcuts: () => setSheetOpen(true),
      }),
    [doc, page, liveSelection, activeBreakpoint, host, insert, apply],
  );
  useCommandKeys(commands);

  const componentActions: ComponentActions | undefined = realDoc
    ? {
        doc: realDoc,
        create: (nodeId) => {
          if (!realDoc) return;
          const ids = { component: newId(), instance: newId() };
          const r = createComponentOps(realDoc, nodeId, ids);
          if (!r.ok) return setComponentError(r.message);
          const failure = host.apply(r.ops);
          setComponentError(failure ? failure.message : null);
          if (!failure) setSelection([ids.instance]);
        },
        editMain: (id) => {
          const c = realDoc?.components[id];
          if (!c) return;
          // Remember the page, so Back to page returns to it.
          if (!main) setPageId(activePageId);
          setEditingMain({ componentId: id, variantKey: defaultVariantKey(c) });
          setSelection([]);
        },
        editing: main ? { component: main, variantKey: mainKey } : null,
        setVariantKey: (key) => setEditingMain((m) => m && { ...m, variantKey: key }),
        done: () => {
          setEditingMain(null);
          setSelection([]);
        },
      }
    : undefined;
  const insertInstance = (componentId: string) => {
    const c = realDoc?.components[componentId];
    if (!doc || !page || !c) return;
    const node = newInstance(c, newId());
    const target = insertTarget(
      doc,
      main?.root ?? page.root,
      liveSelection.at(-1) ?? null,
      "button",
    );
    const failure = apply(insertOps([node], target));
    setComponentError(failure ? failure.message : null);
    if (!failure) setSelection([node.id]);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        host={host}
        doc={realDoc}
        pageId={main ? pageId : activePageId}
        onPageChange={(id) => {
          setEditingMain(null);
          setPageId(id);
          setSelection([]);
        }}
        onManagePages={() => setLeftTab("pages")}
        view={view}
        onViewChange={setView}
        breakpoint={activeBreakpoint}
        onBreakpointChange={setBreakpoint}
        backHref={backHref}
        BackLink={Link}
        onOpenCommands={() => setPaletteOpen(true)}
      />
      {host.sync.lastError ? (
        <p role="alert" className="border-b bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
          That change couldn't be saved: {host.sync.lastError.message}
        </p>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-[256px_minmax(0,1fr)_280px]">
        <aside aria-label="Left panel" className="min-h-0 border-r">
          <LeftPanel
            tab={leftTab}
            onTabChange={setLeftTab}
            content={{
              pages:
                realDoc && page ? (
                  <PagesPanel
                    doc={realDoc}
                    activePageId={main ? (pageId ?? "") : page.id}
                    onOpenPage={(id) => {
                      setEditingMain(null);
                      setPageId(id);
                      setSelection([]);
                    }}
                    apply={apply}
                  />
                ) : null,
              layers:
                doc && page ? (
                  <LayersPanel
                    doc={doc}
                    page={page}
                    selection={liveSelection}
                    editing={activeBreakpoint}
                    onSelect={(ids, bp) => {
                      setSelection(ids);
                      setBreakpoint(bp);
                    }}
                    apply={(ops) => {
                      apply(ops);
                    }}
                    classes={output?.classes ?? EMPTY_CLASSES}
                    locked={locks.locked}
                    onToggleLock={locks.toggle}
                  />
                ) : null,
              components: realDoc ? (
                <ComponentsPanel
                  doc={realDoc}
                  selected={liveSelection.at(-1) ?? null}
                  editingId={mainId}
                  error={componentError}
                  onCreate={(id) => componentActions?.create(id)}
                  onInsert={insertInstance}
                  onEditMain={(id) => componentActions?.editMain(id)}
                  onRename={(id, name) => host.apply(renameComponentOps(realDoc, id, name))}
                  onDelete={(id) => {
                    const failure = host.apply(deleteComponentOps(realDoc, id, newId));
                    setComponentError(failure ? failure.message : null);
                    if (!failure && id === mainId) componentActions?.done();
                  }}
                />
              ) : null,
              variables: doc ? <VariablesPanel doc={doc} apply={apply} /> : null,
              assets: realDoc ? (
                <AssetsPanel
                  doc={realDoc}
                  host={host.assets}
                  apply={host.apply}
                  onInsert={(asset) => {
                    if (!doc || !page) return;
                    const node = imageNodeFor(asset, newId());
                    const target = insertTarget(
                      doc,
                      main?.root ?? page.root,
                      liveSelection.at(-1) ?? null,
                      "image",
                    );
                    if (!apply(insertOps([node], target))) setSelection([node.id]);
                  }}
                />
              ) : null,
            }}
          />
        </aside>
        <main aria-label={view === "design" ? "Canvas" : "Code"} className="relative min-h-0">
          {view === "design" ? <InsertToolbar onInsert={insert} disabled={!doc || !page} /> : null}
          {view === "design" && main ? (
            <div
              role="status"
              className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-violet-300 bg-violet-50 py-1 pr-1 pl-3 text-xs text-violet-900 shadow-sm"
            >
              <span>
                Editing main component <strong>{main.name}</strong>
                {main.variantProps.length ? ` · ${mainKey.replaceAll(",", ", ")}` : null}
              </span>
              <button
                type="button"
                onClick={() => componentActions?.done()}
                className="rounded-full bg-violet-600 px-2.5 py-0.5 font-medium text-white hover:bg-violet-700"
              >
                Back to page
              </button>
            </div>
          ) : null}
          {view === "design" ? (
            doc && page ? (
              <Canvas
                apiRef={canvasApi}
                breakpoints={doc.breakpoints}
                editing={activeBreakpoint}
                onEditingChange={setBreakpoint}
                fitKey={page.id}
                contentReady={compiled.status !== "loading"}
                overlay={(ctx) => (
                  <SelectionLayer
                    {...ctx}
                    doc={doc}
                    pageRoot={page.root}
                    renderKey={output}
                    editing={activeBreakpoint}
                    onEditingChange={setBreakpoint}
                    selection={liveSelection}
                    onSelectionChange={setSelection}
                    apply={apply}
                    guides={guides}
                    locked={locks.locked}
                  />
                )}
                renderFrame={(bp) =>
                  output ? (
                    <RenderedFrame
                      doc={doc}
                      output={output}
                      pageId={page.id}
                      breakpoint={bp}
                      options={treeOptions}
                    />
                  ) : (
                    <div
                      data-tf-frame={bp}
                      className="grid h-100 place-items-center p-6 text-center text-sm text-muted-foreground"
                    >
                      {compiled.status === "error"
                        ? `The page couldn't be drawn: ${compiled.message}`
                        : null}
                    </div>
                  )
                }
              />
            ) : (
              <p className="grid h-full place-items-center text-sm text-muted-foreground">
                Loading the document…
              </p>
            )
          ) : (
            <ComingSoon title="Code View">
              The generated project will appear here, read-only and updated as you design.
            </ComingSoon>
          )}
        </main>
        <aside aria-label="Right panel" className="min-h-0 border-l">
          <RightPanel
            tab={rightTab}
            onTabChange={setRightTab}
            content={{
              inspect:
                doc && page ? (
                  <Inspector
                    doc={doc}
                    page={page}
                    selection={liveSelection}
                    bp={activeBreakpoint}
                    onBreakpointChange={setBreakpoint}
                    onSelectionChange={setSelection}
                    apply={(ops) => {
                      apply(ops);
                    }}
                    guides={guides}
                    onGuidesChange={setGuides}
                    components={componentActions}
                    assets={host.assets}
                    exports={host.exports}
                  />
                ) : null,
              agent: (
                <ComingSoon title="Agent">The design agent arrives in a later update.</ComingSoon>
              ),
              history: (
                <ComingSoon title="History">
                  Revisions and named versions arrive in a later update.
                </ComingSoon>
              ),
              comments: (
                <ComingSoon title="Comments">Comments arrive in a later update.</ComingSoon>
              ),
            }}
          />
        </aside>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      <ShortcutSheet open={sheetOpen} onOpenChange={setSheetOpen} commands={commands} />
    </div>
  );
}
