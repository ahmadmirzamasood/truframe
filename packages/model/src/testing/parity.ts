/**
 * The JSON fixtures shared with the Rust mirror (`crates/compiler/tests/parity.rs`).
 * `node scripts/model-fixtures.ts` writes them to `fixtures/model/`; the parity tests on both
 * sides read the committed files, and `parity.test.ts` fails if they drift from this list.
 */
import { FRAMEWORKS } from "../document.ts";
import { TEMPLATES, templateDocument } from "../templates.ts";
import { desktopOnly, FIXTURE_PROJECT_ID, kitchenSink } from "./fixtures.ts";

export function validFixtures(): Record<string, unknown> {
  const out: Record<string, unknown> = {
    "kitchen-sink": kitchenSink(),
    "desktop-only": desktopOnly(),
  };
  for (const t of TEMPLATES)
    out[`template-${t.id}`] = templateDocument(t.id, {
      projectId: FIXTURE_PROJECT_ID,
      framework: FRAMEWORKS[0],
    });
  return out;
}

type Json = Record<string, unknown>;
const at = (doc: Json, ...path: string[]): Json => path.reduce<Json>((o, k) => o[k] as Json, doc);

/**
 * Shape errors that both sides must reject. Range and reference rules are checked only by the
 * TypeScript validator, so they don't belong here.
 */
export function invalidFixtures(): Record<string, unknown> {
  const mutate = (fn: (d: Json) => void): Json => {
    const d = kitchenSink() as unknown as Json;
    fn(d);
    return d;
  };
  return {
    "unknown-root-key": mutate((d) => {
      d.extra = true;
    }),
    "unknown-node-key": mutate((d) => {
      at(d, "nodes", "title").onclick = "alert(1)";
    }),
    "unknown-style-prop": mutate((d) => {
      at(d, "nodes", "title", "style", "desktop").color = "#ffffff";
    }),
    "unknown-node-type": mutate((d) => {
      at(d, "nodes", "title").type = "video";
    }),
    "missing-node-style": mutate((d) => {
      delete at(d, "nodes", "title").style;
    }),
    "missing-desktop-breakpoint": mutate((d) => {
      delete at(d, "breakpoints").desktop;
    }),
    "wrong-field-type": mutate((d) => {
      at(d, "nodes", "cta").newTab = "yes";
    }),
    "unknown-enum-value": mutate((d) => {
      at(d, "nodes", "hero", "style", "desktop").direction = "diagonal";
    }),
    "unknown-size-type": mutate((d) => {
      at(d, "nodes", "hero", "style", "tablet").height = { type: "auto" };
    }),
    "unknown-framework": mutate((d) => {
      d.framework = "remix";
    }),
    "variable-missing-desktop": mutate((d) => {
      delete at(d, "variables", "brand", "value").desktop;
    }),
  };
}
