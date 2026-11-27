/**
 * Assets panel logic (PRD F14, F29) as pure functions: where each asset is used, replace an
 * asset everywhere, delete one (every use is cleared first, in the same transaction), folders,
 * search and the image layer an asset inserts as.
 */
import {
  type Asset,
  BREAKPOINT_IDS,
  type ImageNode,
  type InstanceNode,
  type ProjectDocument,
} from "@truframe/model";
import type { Op } from "@truframe/ops";

export const ACCEPTED_TYPES = ".png,.jpg,.jpeg,.webp,.gif,.svg";
export const ACCEPTED_LABEL = "PNG, JPEG, WebP, GIF, SVG";

/** How many places (layers, fills, pages, components, instances) use each asset. */
export function assetUsage(doc: ProjectDocument): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (id: string | null | undefined) => {
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  for (const n of Object.values(doc.nodes)) {
    if (n.type === "image") add(n.assetId);
    for (const bp of BREAKPOINT_IDS) {
      const fill = n.style[bp]?.fill;
      if (fill?.type === "image") add(fill.assetId);
    }
    if (n.type === "instance") {
      for (const o of Object.values(n.overrides.nodes)) add(o.assetId);
      const c = doc.components[n.componentId];
      for (const p of c?.props ?? [])
        if (p.type === "image") {
          const v = n.overrides.props[p.name];
          if (typeof v === "string") add(v);
        }
    }
  }
  for (const c of Object.values(doc.components))
    for (const p of c.props)
      if (p.type === "image" && typeof p.default === "string") add(p.default);
  for (const p of doc.pages) add(p.seo.ogImage);
  return counts;
}

/**
 * The ops that point every use of `from` at `to` (or clear it with `null`): image layers,
 * image fills, page social images, instance overrides, image props and their defaults.
 */
function retarget(doc: ProjectDocument, from: string, to: string | null): Op[] {
  const ops: Op[] = [];
  for (const n of Object.values(doc.nodes)) {
    if (n.type === "image" && n.assetId === from)
      ops.push({ op: "setNodeFields", nodeId: n.id, fields: { assetId: to } });
    for (const bp of BREAKPOINT_IDS) {
      const fill = n.style[bp]?.fill;
      if (fill?.type !== "image" || fill.assetId !== from) continue;
      ops.push(
        to
          ? {
              op: "setProp",
              nodeId: n.id,
              breakpoint: bp,
              key: "fill",
              value: { ...fill, assetId: to },
            }
          : { op: "resetProp", nodeId: n.id, breakpoint: bp, key: "fill" },
      );
    }
    if (n.type === "instance") ops.push(...retargetInstance(doc, n, from, to));
  }
  for (const c of Object.values(doc.components)) {
    if (!c.props.some((p) => p.type === "image" && p.default === from)) continue;
    ops.push({
      op: "updateComponent",
      componentId: c.id,
      fields: {
        props: c.props.map((p) =>
          p.type === "image" && p.default === from ? { ...p, default: to } : p,
        ),
      },
    });
  }
  for (const p of doc.pages)
    if (p.seo.ogImage === from)
      ops.push({ op: "updatePage", pageId: p.id, fields: { seo: { ...p.seo, ogImage: to } } });
  return ops;
}

function retargetInstance(
  doc: ProjectDocument,
  n: InstanceNode,
  from: string,
  to: string | null,
): Op[] {
  const ops: Op[] = [];
  for (const [nodeId, o] of Object.entries(n.overrides.nodes))
    if (o.assetId === from)
      ops.push({
        op: "setInstanceOverride",
        nodeId: n.id,
        kind: "nodes",
        key: nodeId,
        value: { ...o, assetId: to },
      });
  const c = doc.components[n.componentId];
  for (const p of c?.props ?? [])
    if (p.type === "image" && n.overrides.props[p.name] === from)
      ops.push({ op: "setInstanceOverride", nodeId: n.id, kind: "props", key: p.name, value: to });
  return ops;
}

/** Points every use of one asset at another (Replace everywhere). */
export function replaceEverywhereOps(doc: ProjectDocument, from: string, to: string): Op[] {
  return from === to ? [] : retarget(doc, from, to);
}

/**
 * Deletes an asset from the document: image layers become placeholders, image fills are
 * removed, social images and image props are cleared, then the asset goes. One transaction.
 */
export function deleteAssetOps(doc: ProjectDocument, id: string): Op[] {
  if (!doc.assets[id]) return [];
  return [...retarget(doc, id, null), { op: "deleteAsset", assetId: id }];
}

export function updateAssetOps(
  doc: ProjectDocument,
  id: string,
  fields: Partial<Pick<Asset, "name" | "folder" | "alt">>,
): Op[] {
  const a = doc.assets[id];
  if (!a) return [];
  const next: Asset = { ...a };
  for (const [k, v] of Object.entries(fields) as [keyof typeof fields, string | undefined][]) {
    const value = v?.trim();
    if (k === "name") {
      if (value) next.name = value.slice(0, 255);
    } else if (value) next[k] = value;
    else delete next[k];
  }
  return [{ op: "upsertAsset", asset: next }];
}

export function folderNames(doc: ProjectDocument): string[] {
  return [
    ...new Set(
      Object.values(doc.assets)
        .map((a) => a.folder ?? "")
        .filter(Boolean),
    ),
  ].sort();
}

/** Assets in a folder (`null` = all), matching a search on name, folder or alt text. */
export function listAssets(doc: ProjectDocument, folder: string | null, query = ""): Asset[] {
  const q = query.trim().toLowerCase();
  return Object.values(doc.assets)
    .filter((a) => folder === null || (a.folder ?? "") === folder)
    .filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        (a.folder ?? "").toLowerCase().includes(q) ||
        (a.alt ?? "").toLowerCase().includes(q),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** An image layer showing the asset at its natural aspect ratio, with its default alt text. */
export function imageNodeFor(asset: Asset, id: string): ImageNode {
  const width = Math.min(asset.width, 480);
  return {
    id,
    type: "image",
    name: asset.name.replace(/\.[a-z0-9]+$/i, ""),
    tag: "img",
    style: {
      desktop: {
        width: { type: "fixed", value: width },
        height: {
          type: "fixed",
          value: Math.max(1, Math.round((width * asset.height) / asset.width)),
        },
      },
    },
    assetId: asset.id,
    alt: asset.alt ?? "",
    decorative: false,
    fit: "fill",
  };
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${Math.round((n / 1024 ** 3) * 10) / 10} GB`;
  if (n >= 1024 * 1024) return `${Math.round((n / 1024 ** 2) * 10) / 10} MB`;
  return `${Math.max(1, Math.ceil(n / 1024))} KB`;
}
