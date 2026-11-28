/**
 * ▶ Play on the canvas (P6A-4). Canvas frames don't animate while you design; Play adds a
 * layer's animation classes to its elements in every frame for one run, then takes them off.
 * In view layers play as if they had just scrolled in, and loops run twice. The frame's
 * stylesheet already holds the site's `animations.css` and each element's `--tf-*` values.
 */
import type { NodeAnimation } from "@truframe/compiler-wasm";
import { childrenOf, type ProjectDocument } from "@truframe/model";

/** The elements Play animates for `ids`: each animated layer, or its staggered children. */
export function playTargets(
  doc: ProjectDocument,
  ids: readonly string[],
  animations: Readonly<Record<string, NodeAnimation>>,
): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const n = doc.nodes[id];
    if (!n?.animation) continue;
    if (n.animation.staggerChildren !== undefined) {
      for (const c of childrenOf(n)) if (animations[c]) out.push(c);
    } else if (animations[id]) out.push(id);
  }
  return out;
}

/** The classes Play puts on: the site's, with In view replaced by a plain run. */
export function playClasses(a: NodeAnimation): string[] {
  return a.classes.split(" ").map((c) => (c === "tf-view" || c === "tf-view-once" ? "tf-load" : c));
}

/** Milliseconds one run takes, from the element's `--tf-*` values (defaults as in CSS). */
export function playDuration(a: NodeAnimation): number {
  const ms = (name: string, fallback: number) => {
    const m = new RegExp(`${name}:\\s*(-?[\\d.]+)ms`).exec(a.vars);
    return m ? Number(m[1]) : fallback;
  };
  const runs = a.classes.split(" ").includes("tf-loop") ? 2 : 1;
  return ms("--tf-delay", 0) + ms("--tf-duration", 600) * runs;
}

const running = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** Plays `ids` in every frame under `root`; returns how long the longest run takes. */
export function play(
  root: ParentNode,
  doc: ProjectDocument,
  ids: readonly string[],
  animations: Readonly<Record<string, NodeAnimation>>,
): number {
  let longest = 0;
  for (const id of playTargets(doc, ids, animations)) {
    const a = animations[id] as NodeAnimation;
    const classes = playClasses(a);
    const time = playDuration(a);
    longest = Math.max(longest, time);
    const selector = `[data-tf-frame] :is([data-tf-node="${id}"],[data-tf-c="${id}"])`;
    for (const el of root.querySelectorAll<HTMLElement>(selector)) {
      const prev = running.get(el);
      if (prev) clearTimeout(prev);
      // Restart: take the classes off and force a style flush before putting them back.
      el.classList.remove(...classes);
      void el.offsetWidth;
      el.classList.add(...classes);
      running.set(
        el,
        setTimeout(() => {
          el.classList.remove(...classes);
          running.delete(el);
        }, time + 100),
      );
    }
  }
  return longest;
}
