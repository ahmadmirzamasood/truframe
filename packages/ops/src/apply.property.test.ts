/**
 * Property test (P2-3): random op sequences keep the document valid, a failed transaction
 * changes nothing, and every transaction's inverse restores the previous document exactly.
 */
import { type ProjectDocument, validateDocument } from "@truframe/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyTransaction } from "./apply.ts";
import { choice, startDocs, transactionOps } from "./generator.ts";
import { type Op, opSchema } from "./ops.ts";
import { canonical } from "./testing.ts";

const RUNS = 1000;
const limits = { pagesPerProject: 4 };

describe("ops property test", () => {
  it(`keeps documents valid and undo exact over ${RUNS} random runs`, () => {
    let applied = 0;
    let rejected = 0;
    const appliedKinds = new Set<string>();
    fc.assert(
      fc.property(
        fc.nat(startDocs().length - 1),
        fc.array(fc.array(choice, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 25 }),
        (start, transactions) => {
          let doc = startDocs()[start] as ProjectDocument;
          const history: { before: string; inverse: Op[] }[] = [];
          for (const choices of transactions) {
            const ops = transactionOps(doc, choices, limits);
            const before = canonical(doc);
            const result = applyTransaction(doc, ops, limits);
            expect(canonical(doc)).toBe(before); // never mutates its input
            if (!result.ok) {
              rejected++;
              continue;
            }
            applied++;
            for (const op of ops) appliedKinds.add(op.op);
            expect(validateDocument(result.doc).ok).toBe(true);
            const undo = applyTransaction(result.doc, result.inverse, limits);
            expect(undo.ok).toBe(true);
            if (!undo.ok) return;
            expect(canonical(undo.doc)).toBe(before);
            const redo = applyTransaction(undo.doc, undo.inverse, limits);
            expect(redo.ok && canonical(redo.doc)).toBe(canonical(result.doc));
            history.push({ before, inverse: result.inverse });
            doc = result.doc;
          }
          // Undoing every transaction, newest first, returns to the starting document.
          for (const step of history.reverse()) {
            const undo = applyTransaction(doc, step.inverse, limits);
            expect(undo.ok).toBe(true);
            if (!undo.ok) return;
            expect(canonical(undo.doc)).toBe(step.before);
            doc = undo.doc;
          }
        },
      ),
      { numRuns: RUNS },
    );
    // The generator must exercise both paths, not just produce rejected ops.
    expect(applied).toBeGreaterThan(RUNS * 2);
    expect(rejected).toBeGreaterThan(RUNS / 10);
    expect([...appliedKinds].sort()).toEqual(
      [...opSchema.options.map((o) => o.shape.op.value)].sort(),
    );
  }, 120_000);
});
