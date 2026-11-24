"use client";

/**
 * Minimal editor shell around the synced document (P2-6). Design View replaces the body in P4;
 * the store wiring (connection, offline cache, undo/redo) stays.
 */
import type { Node, ProjectDocument } from "@truframe/model";
import type { DocClient, DocState } from "@truframe/sync";
import { Button } from "@truframe/ui/components/button";
import { Input } from "@truframe/ui/components/input";
import { Label } from "@truframe/ui/components/label";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

const STATUS_LABEL: Record<DocState["status"], string> = {
  connecting: "Connecting…",
  online: "Online",
  offline: "Offline",
};

async function roomToken(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/room-token`, { method: "POST" });
  if (!res.ok) throw new Error(`Room token request failed (${res.status})`);
  return (await res.json()) as { token: string; url: string };
}

function textOf(node: Node | undefined): string {
  return node?.type === "text" ? node.content.map((s) => s.text).join("") : (node?.name ?? "");
}

function newNodeId(): string {
  return `t${crypto.randomUUID().replaceAll("-", "").slice(0, 15)}`;
}

export function ProjectEditor({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const client = useRef<DocClient | null>(null);
  const [state, setState] = useState<DocState | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    let stopped = false;
    let unsubscribe = () => {};
    const onOnline = () => client.current?.reconnect();
    const onOffline = () => client.current?.disconnect();
    // Loads Loro (about 1.2 MB of WASM) only on this route.
    void import("@truframe/sync").then(async ({ DocClient, indexedDbCache }) => {
      if (stopped) return;
      const c = new DocClient({
        projectId,
        getRoomToken: () => roomToken(projectId),
        cache: indexedDbCache(),
      });
      client.current = c;
      unsubscribe = c.subscribe(setState);
      await c.start();
    });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      stopped = true;
      unsubscribe();
      client.current?.stop();
      client.current = null;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [projectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) client.current?.redo();
      else client.current?.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const doc = state?.doc ?? null;
  const page = doc?.pages[0];
  const body = page ? doc?.nodes[page.root] : undefined;
  const layers = body && "children" in body ? body.children.map((id) => doc?.nodes[id]) : [];

  const addText = (e: FormEvent) => {
    e.preventDefault();
    const words = text.trim();
    if (!words || !doc || !page) return;
    const error = client.current?.apply([
      {
        op: "insertNodes",
        parentId: page.root,
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
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            ← Projects
          </Link>
          <h1 className="font-semibold">{projectName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <output
            data-testid="sync-status"
            aria-live="polite"
            className="rounded-md border px-2 py-0.5 text-xs"
          >
            {state ? STATUS_LABEL[state.status] : "Loading…"}
            {state?.pending
              ? ` · ${state.pending} unsaved ${state.pending === 1 ? "change" : "changes"}`
              : ""}
          </output>
          <Button
            size="sm"
            variant="ghost"
            disabled={!state?.canUndo}
            onClick={() => client.current?.undo()}
          >
            Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!state?.canRedo}
            onClick={() => client.current?.redo()}
          >
            Redo
          </Button>
        </div>
      </header>

      {state?.lastError ? (
        <p role="alert" className="text-sm text-destructive">
          That change couldn't be saved: {state.lastError.message}
        </p>
      ) : null}

      {doc ? (
        <Editor doc={doc} layers={layers} text={text} setText={setText} addText={addText} />
      ) : (
        <p className="text-sm text-muted-foreground">Loading the document…</p>
      )}
    </main>
  );
}

function Editor(props: {
  doc: ProjectDocument;
  layers: (Node | undefined)[];
  text: string;
  setText: (v: string) => void;
  addText: (e: FormEvent) => void;
}) {
  return (
    <section aria-labelledby="layers-heading" className="grid gap-4">
      <h2 id="layers-heading" className="text-sm font-medium">
        Layers on {props.doc.pages[0]?.name}
      </h2>
      <ol aria-label="Layers" className="grid gap-1 rounded-xl border p-3 text-sm">
        {props.layers.map((n) =>
          n ? (
            <li key={n.id} aria-label={textOf(n) || n.type} className="truncate">
              {textOf(n) || n.type} <span className="text-xs text-muted-foreground">({n.tag})</span>
            </li>
          ) : null,
        )}
      </ol>
      <form onSubmit={props.addText} className="flex items-end gap-2">
        <div className="grid flex-1 gap-1">
          <Label htmlFor="new-text">Add a text layer</Label>
          <Input id="new-text" value={props.text} onChange={(e) => props.setText(e.target.value)} />
        </div>
        <Button type="submit">Add</Button>
      </form>
    </section>
  );
}
