import { kitchenSink } from "@truframe/model/testing";
import { describe, expect, it } from "vitest";
import { ownerOf } from "./tree.ts";

describe("ownerOf", () => {
  it("finds the page or component that holds a layer", () => {
    const doc = kitchenSink();
    const page = doc.pages[0];
    if (!page) throw new Error("no page");
    expect(ownerOf(doc, page.root)).toEqual({ kind: "page", id: page.id });
    const component = Object.values(doc.components)[0];
    if (!component) throw new Error("no component");
    expect(ownerOf(doc, component.root)).toEqual({ kind: "component", id: component.id });
    expect(ownerOf(doc, "missing")).toBeNull();
  });
});
