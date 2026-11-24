"use client";

import type { BreakpointId } from "@truframe/model";
import { RenderedFrame } from "@truframe/renderer";
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Canvas } from "./canvas.tsx";
import type { EditorHost } from "./host.ts";
import { createNodes, type InsertTool, insertOps, insertTarget } from "./insert.ts";
import { InsertToolbar } from "./insert-toolbar.tsx";
import { type Guides, Inspector } from "./inspector/inspector.tsx";
import { LayersPanel, useLocks } from "./layers-panel.tsx";
import { PagesPanel } from "./pages-panel.tsx";
import { ComingSoon, LeftPanel, type LeftTab, RightPanel, type RightTab } from "./panels.tsx";
import { SelectionLayer } from "./selection-layer.tsx";

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
  const { doc } = host;
  const [pageId, setPageId] = useState<string | null>(null);
  const [view, setView] = useState<EditorView>("design");
  const [breakpoint, setBreakpoint] = useState<BreakpointId>("desktop");
  const [leftTab, setLeftTab] = useState<LeftTab>("layers");
  const [rightTab, setRightTab] = useState<RightTab>("inspect");
  /** Selected layer ids; the last one is the focus (P4-6 adds pointer selection). */
  const [selection, setSelection] = useState<string[]>([]);
  /** Column guides per breakpoint: a design aid, not part of the site. */
  const [guides, setGuides] = useState<Guides>({});

  // Follow the document: keep the active page if it still exists, otherwise show the first.
  const activePageId =
    doc && pageId && doc.pages.some((p) => p.id === pageId) ? pageId : (doc?.pages[0]?.id ?? null);
  const activeBreakpoint = doc?.breakpoints[breakpoint] ? breakpoint : "desktop";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) host.redo();
      else host.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [host]);

  const page = doc?.pages.find((p) => p.id === activePageId);
  const compiled = useCompiled(doc);
  const locks = useLocks(doc?.id);
  // Layers removed by undo or by someone else drop out of the selection.
  const liveSelection = useMemo(
    () => (doc ? selection.filter((id) => doc.nodes[id]) : []),
    [doc, selection],
  );
  const output = compiled.status === "loading" ? null : compiled.output;

  const insert = useCallback(
    (tool: InsertTool) => {
      if (!doc || !page) return;
      const nodes = createNodes(tool);
      const target = insertTarget(doc, page.root, liveSelection.at(-1) ?? null, tool);
      const failure = host.apply(insertOps(nodes, target));
      if (!failure && nodes[0]) setSelection([nodes[0].id]);
    },
    [doc, page, liveSelection, host],
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        host={host}
        doc={doc}
        pageId={activePageId}
        onPageChange={setPageId}
        onManagePages={() => setLeftTab("pages")}
        view={view}
        onViewChange={setView}
        breakpoint={activeBreakpoint}
        onBreakpointChange={setBreakpoint}
        backHref={backHref}
        BackLink={Link}
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
                doc && page ? (
                  <PagesPanel
                    doc={doc}
                    activePageId={page.id}
                    onOpenPage={(id) => {
                      setPageId(id);
                      setSelection([]);
                    }}
                    apply={host.apply}
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
                      host.apply(ops);
                    }}
                    classes={output?.classes ?? EMPTY_CLASSES}
                    locked={locks.locked}
                    onToggleLock={locks.toggle}
                  />
                ) : null,
              components: (
                <ComingSoon title="Components">
                  Reusable components arrive in a later update.
                </ComingSoon>
              ),
              variables: (
                <ComingSoon title="Variables">
                  Colors, spacing and text styles arrive in a later update.
                </ComingSoon>
              ),
              assets: (
                <ComingSoon title="Assets">Image uploads arrive in a later update.</ComingSoon>
              ),
            }}
          />
        </aside>
        <main aria-label={view === "design" ? "Canvas" : "Code"} className="relative min-h-0">
          {view === "design" ? <InsertToolbar onInsert={insert} disabled={!doc || !page} /> : null}
          {view === "design" ? (
            doc && page ? (
              <Canvas
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
                    apply={host.apply}
                    guides={guides}
                    locked={locks.locked}
                  />
                )}
                renderFrame={(bp) =>
                  output ? (
                    <RenderedFrame doc={doc} output={output} pageId={page.id} breakpoint={bp} />
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
                      host.apply(ops);
                    }}
                    guides={guides}
                    onGuidesChange={setGuides}
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
    </div>
  );
}
