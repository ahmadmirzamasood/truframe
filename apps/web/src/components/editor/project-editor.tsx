"use client";

/**
 * Connects the Design View (`@truframe/editor`) to the synced document store (P2-6): room
 * connection, offline cache and undo/redo live here; the editor only reads and sends ops.
 */
import { DesignEditor, type EditorHost } from "@truframe/editor";
import type { DocClient, DocState } from "@truframe/sync";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

async function roomToken(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/room-token`, { method: "POST" });
  if (!res.ok) throw new Error(`Room token request failed (${res.status})`);
  return (await res.json()) as { token: string; url: string };
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
      // Local development and e2e only: lets tests read the document they built in the UI.
      if (process.env.NODE_ENV !== "production")
        (window as unknown as { __truframeDoc?: () => unknown }).__truframeDoc = () =>
          c.state().doc;
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

  const host = useMemo<EditorHost>(
    () => ({
      projectName,
      doc: state?.doc ?? null,
      sync: state
        ? {
            status: state.status,
            pending: state.pending,
            canUndo: state.canUndo,
            canRedo: state.canRedo,
            lastError: state.lastError,
          }
        : { status: "loading", pending: 0, canUndo: false, canRedo: false, lastError: null },
      // DocClient.apply returns null on success, so don't coalesce it.
      apply: (ops) =>
        client.current ? client.current.apply(ops) : { message: "The editor is still loading." },
      undo: () => client.current?.undo(),
      redo: () => client.current?.redo(),
    }),
    [projectName, state],
  );

  return <DesignEditor host={host} backHref="/dashboard" Link={Link} />;
}
