// Measures how long the WASM compiler takes for one page (P3-6, budget < 30 ms).
//
//   pnpm compiler:build && node scripts/bench-compiler.ts [--runs 200]
//
// The benchmark page has ~300 layers (sections of cards with text, images, links and
// per-breakpoint overrides) plus variables, the shape of a real landing page. Each run is a
// whole `compile()` call through the JS wrapper: JSON in, every file printed, JSON out.
import { parseArgs } from "node:util";
import { compileJson, initCompilerFromDisk } from "../packages/compiler-wasm/src/node.ts";
import { benchmarkPage } from "../packages/model/src/testing/benchmark.ts";

const { values } = parseArgs({ options: { runs: { type: "string", default: "200" } } });
const runs = Number(values.runs);

initCompilerFromDisk();
const results: Array<{ name: string; layers: number; median: number; p95: number; max: number }> =
  [];
for (const [name, layers] of [
  ["300-layer page", 300],
  ["1,000-layer page", 1000],
] as const) {
  const doc = benchmarkPage(layers);
  const json = JSON.stringify(doc);
  for (const framework of ["nextjs", "astro"] as const) {
    for (let i = 0; i < 20; i++) compileJson(json, framework); // warm up
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t = performance.now();
      compileJson(json, framework);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const at = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))] ?? 0;
    results.push({
      name: `${name} (${framework})`,
      layers: Object.keys(doc.nodes).length,
      median: at(0.5),
      p95: at(0.95),
      max: times[times.length - 1] ?? 0,
    });
  }
}
console.log(`node ${process.version}, ${runs} runs each`);
for (const r of results) {
  console.log(
    `${r.name}: ${r.layers} layers, median ${r.median.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms, max ${r.max.toFixed(2)} ms`,
  );
}
