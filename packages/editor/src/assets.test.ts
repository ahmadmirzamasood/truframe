import { compile, initCompilerFromDisk } from "@truframe/compiler-wasm/node";
import type { Asset, ProjectDocument } from "@truframe/model";
import { kitchenSink } from "@truframe/model/testing";
import { applyTransaction, type Op } from "@truframe/ops";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assetUsage,
  deleteAssetOps,
  folderNames,
  imageNodeFor,
  listAssets,
  replaceEverywhereOps,
  updateAssetOps,
} from "./assets.ts";

beforeAll(() => initCompilerFromDisk());

function commit(doc: ProjectDocument, ops: Op[]) {
  const r = applyTransaction(doc, ops, { pagesPerProject: 100 });
  if (!r.ok) throw new Error(r.error.message);
  return r.doc;
}

const second: Asset = {
  id: "photo2",
  name: "beach.jpg",
  mime: "image/jpeg",
  width: 1600,
  height: 900,
  bytes: 120_000,
  key: `assets/${"c".repeat(64)}.jpg`,
};

describe("assets", () => {
  it("counts every use and replaces them all at once", () => {
    let doc = kitchenSink();
    const [first] = Object.keys(doc.assets);
    if (!first) throw new Error("fixture has no asset");
    const used = assetUsage(doc).get(first) ?? 0;
    expect(used).toBeGreaterThan(0);
    doc = commit(doc, [{ op: "upsertAsset", asset: second }]);
    doc = commit(doc, replaceEverywhereOps(doc, first, second.id));
    expect(assetUsage(doc).get(first)).toBeUndefined();
    expect(assetUsage(doc).get(second.id)).toBe(used);
    const out = compile(doc, "nextjs");
    expect(out.assets.map((a) => a.assetId)).toContain(second.id);
    expect(out.assets.map((a) => a.assetId)).not.toContain(first);
  });

  it("deletes an asset by clearing every use first", () => {
    const doc = kitchenSink();
    const [first] = Object.keys(doc.assets);
    if (!first) throw new Error("fixture has no asset");
    const next = commit(doc, deleteAssetOps(doc, first));
    expect(next.assets[first]).toBeUndefined();
    expect(assetUsage(next).get(first)).toBeUndefined();
    // Still compiles: layers became placeholders.
    expect(compile(next, "astro").files).toBeDefined();
  });

  it("renames, files into folders, sets alt text, lists and searches", () => {
    let doc = commit(kitchenSink(), [{ op: "upsertAsset", asset: second }]);
    doc = commit(
      doc,
      updateAssetOps(doc, second.id, { name: "Beach hero", folder: "Hero", alt: "Waves" }),
    );
    expect(doc.assets[second.id]).toMatchObject({
      name: "Beach hero",
      folder: "Hero",
      alt: "Waves",
    });
    expect(folderNames(doc)).toEqual(["Hero"]);
    expect(listAssets(doc, "Hero").map((a) => a.id)).toEqual([second.id]);
    expect(listAssets(doc, null, "waves").map((a) => a.id)).toEqual([second.id]);
    doc = commit(doc, updateAssetOps(doc, second.id, { folder: "" }));
    expect(doc.assets[second.id]?.folder).toBeUndefined();
  });

  it("inserts an image layer at the asset's ratio with its alt text", () => {
    const node = imageNodeFor({ ...second, alt: "Waves" }, "img1");
    expect(node.style.desktop.width).toEqual({ type: "fixed", value: 480 });
    expect(node.style.desktop.height).toEqual({ type: "fixed", value: 270 });
    expect(node.alt).toBe("Waves");
  });
});
