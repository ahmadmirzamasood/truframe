/**
 * P6-2 budget: design → code < 300 ms p50 on a 300-layer page (PLAN P6 exit, ARCHITECTURE
 * §12). Measured in the browser from applying a text change to the moment Code View shows
 * it: local apply, React update, worker compile, diff back, CodeMirror update.
 *
 * The budget is for what users run: a production build (`next build` with
 * NEXT_PUBLIC_TRUFRAME_TEST_HOOKS=1, then `next start`, and TRUFRAME_E2E_PRODUCTION=1 here).
 * Under `next dev` React logs every re-render with a prop diff, which makes the same work
 * 2–4× slower and noisy (314–509 ms p50 on the dev machine), so dev runs (CI) only guard
 * against regressions: before Layers rows were memoized and identical versions shared, the
 * dev p50 was about 1,100 ms. Measured numbers are in docs/project/MEMORY.md (Benchmarks).
 */
import { expect, test } from "@playwright/test";
import { openNewProject } from "./helpers";

type Win = Window & {
  __truframeDoc: () => {
    pages: { root: string }[];
    nodes: Record<string, unknown>;
  };
  __truframeApply: (ops: unknown[]) => unknown;
};

test("design → code under 300 ms p50 on a 300-layer page, compiled in a worker", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const workers: string[] = [];
  page.on("worker", (w) => workers.push(w.url()));
  await openNewProject(page, context, { name: "Perf", templateId: "blank" });

  // 30 sections × (section, heading, 4 × (card, text)) = 300 layers, one transaction.
  const added = await page.evaluate(() => {
    const w = window as unknown as Win;
    const doc = w.__truframeDoc();
    const root = doc.pages[0]?.root ?? "";
    const id = () => crypto.randomUUID();
    const text = (name: string, t: string, tag = "p") => ({
      id: id(),
      type: "text",
      name,
      tag,
      style: { desktop: { fontSize: 18 }, mobile: { fontSize: 16 } },
      content: [{ text: t }],
    });
    const frame = (name: string, children: { id: string }[], tag = "div") => ({
      id: id(),
      type: "frame",
      name,
      tag,
      style: {
        desktop: { display: "stack", direction: "column", gap: 16, width: { type: "fill" } },
        tablet: { gap: 12 },
      },
      children: children.map((c) => c.id),
    });
    const nodes: unknown[] = [];
    const sections: { id: string }[] = [];
    for (let s = 0; s < 30; s++) {
      const kids: { id: string }[] = [];
      const heading = text(`Heading ${s}`, s === 0 ? "Perf 0" : `Section ${s}`, "h2");
      kids.push(heading);
      nodes.push(heading);
      for (let c = 0; c < 4; c++) {
        const t = text(`Copy ${s}-${c}`, `Card ${s}-${c}`);
        const card = frame(`Card ${s}-${c}`, [t]);
        kids.push(card);
        nodes.push(card, t);
      }
      const section = frame(`Section ${s}`, kids, "section");
      sections.push(section);
      nodes.push(section);
    }
    const wrapper = frame("Bench", sections);
    const failure = w.__truframeApply([
      { op: "insertNodes", parentId: root, index: 0, nodes: [wrapper, ...nodes] },
    ]);
    if (failure) throw new Error(JSON.stringify(failure));
    return nodes.length + 1;
  });
  expect(added).toBe(301);

  await page.getByRole("button", { name: "Code", exact: true }).click();
  const content = page.getByTestId("code-view").locator(".cm-content");
  await expect(content).toContainText("Perf 0");
  // The compile runs in a Web Worker (dev names it after compile.worker.ts, builds hash it).
  expect(workers.length).toBeGreaterThan(0);

  const times = await page.evaluate(async () => {
    const w = window as unknown as Win;
    const doc = w.__truframeDoc();
    const target = Object.entries(doc.nodes).find(
      ([, n]) => (n as { content?: { text: string }[] }).content?.[0]?.text === "Perf 0",
    )?.[0];
    const el = document.querySelector('[data-testid="code-view"] .cm-content');
    if (!target || !el) throw new Error("setup");
    const out: number[] = [];
    for (let i = 1; i <= 21; i++) {
      const want = `Perf ${i}`;
      const t0 = performance.now();
      w.__truframeApply([
        { op: "setNodeFields", nodeId: target, fields: { content: [{ text: want }] } },
      ]);
      await new Promise<void>((resolve) => {
        const check = () =>
          el.textContent?.includes(want) ? resolve() : requestAnimationFrame(check);
        check();
      });
      out.push(performance.now() - t0);
      // Let the room confirm the change before the next one, as a person typing would.
      await new Promise((r) => setTimeout(r, 150));
    }
    return out;
  });
  const sorted = [...times].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length / 2)] ?? Infinity;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Infinity;
  console.log(
    `design→code on 300+ layers: p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, all ${times.map((t) => t.toFixed(0)).join(" ")}`,
  );
  expect(p50).toBeLessThan(process.env.TRUFRAME_E2E_PRODUCTION === "1" ? 300 : 900);
});
