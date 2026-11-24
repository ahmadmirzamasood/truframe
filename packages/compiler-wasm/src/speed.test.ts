/**
 * Guards against compile time growing faster than the page (a quadratic step slipped in
 * twice during P3). The budget is 30 ms per page (P3-6, `node scripts/bench-compiler.ts`);
 * the limits here are loose so a slow CI runner doesn't flake.
 */
import { validateDocument } from "@truframe/model";
import { benchmarkPage } from "@truframe/model/testing/benchmark";
import { beforeAll, describe, expect, it } from "vitest";
import { compileJson, initCompilerFromDisk } from "./node.ts";

beforeAll(() => initCompilerFromDisk());

function median(json: string, runs: number): number {
  for (let i = 0; i < 3; i++) compileJson(json);
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    compileJson(json);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? 0;
}

describe("compile speed", () => {
  it("benchmark pages are valid documents", () => {
    for (const n of [300, 1000]) {
      const r = validateDocument(benchmarkPage(n));
      expect(r.ok ? [] : r.issues).toEqual([]);
    }
  });

  it("compiles a 300-layer page well within budget and scales about linearly", () => {
    const small = median(JSON.stringify(benchmarkPage(300)), 15);
    const large = median(JSON.stringify(benchmarkPage(1000)), 7);
    expect(small).toBeLessThan(150);
    // 3.3× the layers; quadratic work would make this ~11×.
    expect(large / small).toBeLessThan(6);
  });
});
