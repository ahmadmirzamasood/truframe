import { type ProjectDocument, templateDocument } from "@truframe/model";
import { describe, expect, it } from "vitest";
import { same, shareDoc } from "./share-doc.ts";

const base = () =>
  templateDocument("saas", {
    projectId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
    framework: "nextjs",
  });

describe("shareDoc", () => {
  it("returns the previous document when nothing changed", () => {
    const a = base();
    expect(shareDoc(a, structuredClone(a))).toBe(a);
  });

  it("keeps unchanged layers and parts, replaces changed ones", () => {
    const a = base();
    const b: ProjectDocument = structuredClone(a);
    const id = Object.keys(b.nodes).find((k) => b.nodes[k]?.type === "text") ?? "";
    const node = b.nodes[id];
    if (node?.type !== "text") throw new Error("no text");
    node.content = [{ text: "Changed" }];
    const out = shareDoc(a, b);
    expect(out).not.toBe(a);
    expect(out).toEqual(b);
    expect(out?.nodes[id]).toBe(b.nodes[id]);
    const other = Object.keys(a.nodes).find((k) => k !== id) ?? "";
    expect(out?.nodes[other]).toBe(a.nodes[other]);
    expect(out?.pages).toBe(a.pages);
    expect(out?.variables).toBe(a.variables);
  });

  it("notices added and removed layers", () => {
    const a = base();
    const b: ProjectDocument = structuredClone(a);
    const [first] = Object.keys(b.nodes);
    delete b.nodes[first ?? ""];
    expect(shareDoc(a, b)).toEqual(b);
    expect(shareDoc(b, structuredClone(a))).toEqual(a);
  });

  it("compares JSON data deeply, ignoring key order", () => {
    expect(same({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(same({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(same([1, 2], [2, 1])).toBe(false);
    expect(same({ a: null }, { a: {} })).toBe(false);
  });

  it("never mixes projects", () => {
    const a = base();
    const c = templateDocument("saas", {
      projectId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c",
      framework: "nextjs",
    });
    expect(shareDoc(a, c)).toBe(c);
  });
});
