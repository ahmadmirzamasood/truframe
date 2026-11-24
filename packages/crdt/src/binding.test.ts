import { type ProjectDocument, validateDocument } from "@truframe/model";
import { kitchenSink } from "@truframe/model/testing";
import { validFixtures } from "@truframe/model/testing/parity";
import { applyTransaction } from "@truframe/ops";
import { canonical, choice, startDocs, transactionOps } from "@truframe/ops/testing";
import fc from "fast-check";
import { LoroDoc } from "loro-crdt";
import { describe, expect, it } from "vitest";
import { applyTransactionToLoro, documentToLoro, loroToDocument } from "./binding.ts";

const limits = { pagesPerProject: 4 };

function seeded(doc: ProjectDocument, peer = 1): LoroDoc {
  const loro = new LoroDoc();
  loro.setPeerId(peer);
  documentToLoro(loro, doc);
  return loro;
}

/** A second replica that starts from `source`'s current state. */
function replica(source: LoroDoc, peer: number): LoroDoc {
  const loro = new LoroDoc();
  loro.setPeerId(peer);
  loro.import(source.export({ mode: "snapshot" }));
  return loro;
}

function sync(a: LoroDoc, b: LoroDoc) {
  b.import(a.export({ mode: "update", from: b.oplogVersion() }));
  a.import(b.export({ mode: "update", from: a.oplogVersion() }));
}

function apply(loro: LoroDoc, ops: unknown[]) {
  const r = applyTransactionToLoro(loro, ops, limits);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r;
}

describe("document ↔ Loro round trip", () => {
  it.each(Object.entries(validFixtures()))("%s survives seeding and reading back", (_name, doc) => {
    const loro = seeded(doc as ProjectDocument);
    expect(canonical(loroToDocument(loro))).toBe(canonical(doc));
  });

  it("survives a snapshot export and import", () => {
    const loro = seeded(kitchenSink());
    const copy = new LoroDoc();
    copy.import(loro.export({ mode: "snapshot" }));
    expect(canonical(loroToDocument(copy))).toBe(canonical(kitchenSink()));
  });

  it("sends only new changes in an update", () => {
    const a = seeded(kitchenSink());
    const b = replica(a, 2);
    apply(a, [
      { op: "setProp", nodeId: "title", breakpoint: "mobile", key: "fontSize", value: 20 },
    ]);
    const update = a.export({ mode: "update", from: b.oplogVersion() });
    expect(update.byteLength).toBeLessThan(a.export({ mode: "snapshot" }).byteLength / 4);
    b.import(update);
    expect(canonical(loroToDocument(b))).toBe(canonical(loroToDocument(a)));
    expect(loroToDocument(b).nodes.title?.style.mobile).toEqual({ fontSize: 20 });
  });

  it("matches applyTransaction for each op and drops empty overrides", () => {
    const loro = seeded(kitchenSink());
    const ops = [
      { op: "setProp", nodeId: "title", breakpoint: "tablet", key: "fontSize", value: 30 },
      { op: "resetProp", nodeId: "title", breakpoint: "tablet", key: "fontSize" },
      { op: "moveNode", nodeId: "title", parentId: "hero", index: 3 },
      { op: "setNodeFields", nodeId: "mail", fields: { ariaLabel: null, name: "Email" } },
      { op: "setInstanceOverride", nodeId: "card", kind: "props", key: "title" },
      { op: "setBreakpoint", breakpoint: "tablet", width: null },
      { op: "movePage", pageId: "about", index: 0 },
    ];
    const expected = applyTransaction(kitchenSink(), ops, limits);
    apply(loro, ops);
    expect(expected.ok && canonical(expected.doc)).toBe(canonical(loroToDocument(loro)));
  });

  it("refuses invalid ops without touching the Loro doc", () => {
    const loro = seeded(kitchenSink());
    const version = loro.oplogVersion().toJSON();
    const r = applyTransactionToLoro(loro, [{ op: "deleteNode", nodeId: "aboutBody" }], limits);
    expect(r.ok).toBe(false);
    expect(loro.oplogVersion().toJSON()).toEqual(version);
  });
});

describe("concurrent edits converge", () => {
  it("keeps both people's changes to different props of one layer", () => {
    const a = seeded(kitchenSink());
    const b = replica(a, 2);
    apply(a, [
      { op: "setProp", nodeId: "title", breakpoint: "desktop", key: "fontSize", value: 60 },
    ]);
    apply(b, [
      { op: "setProp", nodeId: "title", breakpoint: "desktop", key: "opacity", value: 0.5 },
    ]);
    sync(a, b);
    const doc = loroToDocument(a);
    expect(canonical(doc)).toBe(canonical(loroToDocument(b)));
    expect(doc.nodes.title?.style.desktop).toMatchObject({ fontSize: 60, opacity: 0.5 });
  });

  it("never duplicates a node that two people move to different parents", () => {
    const a = seeded(kitchenSink());
    const b = replica(a, 2);
    apply(a, [{ op: "moveNode", nodeId: "title", parentId: "aboutBody", index: 0 }]);
    apply(b, [{ op: "moveNode", nodeId: "title", parentId: "cta", index: 0 }]);
    sync(a, b);
    const doc = loroToDocument(a);
    expect(canonical(doc)).toBe(canonical(loroToDocument(b)));
    expect(validateDocument(doc).ok).toBe(true);
  });

  it("drops edits inside a subtree someone else deleted", () => {
    const a = seeded(kitchenSink());
    const b = replica(a, 2);
    apply(a, [{ op: "deleteNode", nodeId: "hero" }]);
    apply(b, [{ op: "setNodeFields", nodeId: "title", fields: { name: "Late edit" } }]);
    sync(a, b);
    const doc = loroToDocument(b);
    expect(doc.nodes.title).toBeUndefined();
    expect(canonical(doc)).toBe(canonical(loroToDocument(a)));
  });
});

describe("Loro binding property test", () => {
  it("matches applyTransaction and converges on a replica over 300 random runs", () => {
    fc.assert(
      fc.property(
        fc.nat(startDocs().length - 1),
        fc.array(fc.array(choice, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 12 }),
        (start, transactions) => {
          let doc = startDocs()[start] as ProjectDocument;
          const loro = seeded(doc);
          const peer = replica(loro, 2);
          for (const choices of transactions) {
            const ops = transactionOps(doc, choices, limits);
            const expected = applyTransaction(doc, ops, limits);
            const actual = applyTransactionToLoro(loro, ops, limits);
            expect(actual.ok).toBe(expected.ok);
            if (!expected.ok) continue;
            doc = expected.doc;
            expect(canonical(loroToDocument(loro))).toBe(canonical(doc));
          }
          peer.import(loro.export({ mode: "update", from: peer.oplogVersion() }));
          expect(canonical(loroToDocument(peer))).toBe(canonical(doc));
        },
      ),
      { numRuns: 300 },
    );
  }, 120_000);
});
