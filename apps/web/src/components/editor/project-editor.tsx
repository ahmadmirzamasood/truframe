"use client";

/**
 * Connects the Design View (`@truframe/editor`) to the synced document store (P2-6): room
 * connection, offline cache and undo/redo live here; the editor only reads and sends ops.
 */
import { type AssetHost, DesignEditor, type EditorHost, type ExportHost } from "@truframe/editor";
import type { DocClient, DocState } from "@truframe/sync";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

async function roomToken(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/room-token`, { method: "POST" });
  if (!res.ok) throw new Error(`Room token request failed (${res.status})`);
  return (await res.json()) as { token: string; url: string };
}

/** Uploads go through a signed URL the app issues after checking the plan (P5-4). */
function assetHost(projectId: string): AssetHost {
  const errorOf = async (res: Response, fallback: string) => {
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      return body.error?.message ?? fallback;
    } catch {
      return fallback;
    }
  };
  return {
    async upload(file) {
      const ticket = await fetch(`/api/projects/${projectId}/assets/uploads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: file.name, bytes: file.size }),
      });
      if (!ticket.ok)
        return { ok: false, message: await errorOf(ticket, "The upload couldn't start.") };
      const { url } = (await ticket.json()) as { url: string };
      const put = await fetch(url, { method: "PUT", body: file });
      if (!put.ok)
        return { ok: false, message: await errorOf(put, "The upload failed. Try again.") };
      const { asset } = (await put.json()) as { asset: Parameters<AssetHost["url"]>[0] };
      return { ok: true, asset };
    },
    url: (asset, width) =>
      `/api/projects/${projectId}/files/${asset.key}${width ? `?w=${width}` : ""}`,
    async usage() {
      const res = await fetch(`/api/projects/${projectId}/assets`);
      if (!res.ok) return null;
      return ((await res.json()) as { usage: Awaited<ReturnType<AssetHost["usage"]>> }).usage;
    },
  };
}

/** Image export: the server checks the plan's largest scale before rendering (P5-9). */
function exportHost(projectId: string): ExportHost {
  const endpoint = `/api/projects/${projectId}/exports/image`;
  return {
    async maxScale() {
      const res = await fetch(endpoint);
      if (!res.ok) return null;
      return ((await res.json()) as { limits: { maxScale: number } }).limits.maxScale;
    },
    async image(input) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return { ok: false, message: body?.error?.message ?? "The export failed. Try again." };
      }
      return { ok: true, url: ((await res.json()) as { url: string }).url };
    },
  };
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

  const assets = useMemo(() => assetHost(projectId), [projectId]);
  const exports = useMemo(() => exportHost(projectId), [projectId]);
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
      assets,
      exports,
    }),
    [projectName, state, assets, exports],
  );

  return <DesignEditor host={host} backHref="/dashboard" Link={Link} />;
}
