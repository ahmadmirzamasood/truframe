"use client";

import type { BreakpointId, Node, ProjectDocument } from "@truframe/model";
import { Button } from "@truframe/ui/components/button";
import { Input } from "@truframe/ui/components/input";
import { Label } from "@truframe/ui/components/label";
import { type ComponentType, type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { EditorHost } from "./host.ts";
import { ComingSoon, LeftPanel, type LeftTab, RightPanel, type RightTab } from "./panels.tsx";
import { BREAKPOINT_LABEL, type EditorView, TopBar } from "./top-bar.tsx";

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
              pages: (
                <ComingSoon title="Pages">
                  Add, rename and organize pages here. Use the Pages menu in the top bar to switch.
                </ComingSoon>
              ),
              layers:
                doc && page ? <TemporaryLayers host={host} doc={doc} pageRoot={page.root} /> : null,
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
        <main aria-label={view === "design" ? "Canvas" : "Code"} className="min-h-0 bg-muted/60">
          {view === "design" ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              {doc
                ? `${page?.name ?? ""} · ${BREAKPOINT_LABEL[activeBreakpoint]}`
                : "Loading the document…"}
            </div>
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
              inspect: (
                <div className="grid gap-2 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{page?.name ?? "Page"}</p>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {BREAKPOINT_LABEL[activeBreakpoint]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Page</p>
                </div>
              ),
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

function textOf(node: Node | undefined): string {
  return node?.type === "text" ? node.content.map((s) => s.text).join("") : (node?.name ?? "");
}

function newNodeId(): string {
  return `t${crypto.randomUUID().replaceAll("-", "").slice(0, 15)}`;
}

/** The P2 layer list, kept until the real Layers panel (P4-8) and insert tools (P4-5) land. */
function TemporaryLayers(props: { host: EditorHost; doc: ProjectDocument; pageRoot: string }) {
  const [text, setText] = useState("");
  const body = props.doc.nodes[props.pageRoot];
  const layers = body && "children" in body ? body.children.map((id) => props.doc.nodes[id]) : [];

  const addText = (e: FormEvent) => {
    e.preventDefault();
    const words = text.trim();
    if (!words) return;
    const error = props.host.apply([
      {
        op: "insertNodes",
        parentId: props.pageRoot,
        index: layers.length,
        nodes: [
          {
            id: newNodeId(),
            type: "text",
            name: "",
            tag: "p",
            style: { desktop: {} },
            content: [{ text: words }],
          },
        ],
      },
    ]);
    if (!error) setText("");
  };

  return (
    <div className="grid gap-3 p-2">
      <ol aria-label="Layers" className="grid gap-0.5 text-sm">
        {layers.map((n) =>
          n ? (
            <li
              key={n.id}
              aria-label={textOf(n) || n.type}
              className="truncate rounded px-2 py-1 hover:bg-accent"
            >
              {textOf(n) || n.type} <span className="text-xs text-muted-foreground">({n.tag})</span>
            </li>
          ) : null,
        )}
      </ol>
      <form onSubmit={addText} className="grid gap-1.5 px-1">
        <Label htmlFor="new-text" className="text-xs">
          Add a text layer
        </Label>
        <div className="flex gap-1.5">
          <Input
            id="new-text"
            className="h-8"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </div>
      </form>
    </div>
  );
}
