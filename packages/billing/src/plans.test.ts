import { describe, expect, it } from "vitest";
import {
  assertWithinLimit,
  codeAccess,
  featureFor,
  LimitError,
  limitFor,
  PLANS,
  planForWorkspace,
  UNLIMITED,
  usagePeriod,
} from "./plans.ts";

describe("plans", () => {
  it("matches docs/product/BILLING.md §2 and §3 headline numbers", () => {
    expect(limitFor("free", "projects")).toBe(3);
    expect(limitFor("pro", "projects")).toBe(UNLIMITED);
    expect(limitFor("free", "pagesPerProject")).toBe(5);
    expect(limitFor("pro", "pagesPerProject")).toBe(150);
    expect(limitFor("free", "agentCreditsPerMonth")).toBe(30);
    expect(limitFor("pro", "agentCreditsPerMonth")).toBe(1_500);
    expect(limitFor("free", "mcpCallsPerMonth")).toBe(500);
    expect(limitFor("pro", "mcpCallsPerMonth")).toBe(20_000);
    expect(limitFor("free", "vercelProjects")).toBe(1);
    expect(PLANS.free.features.githubPush).toBe(false);
    expect(PLANS.pro.features.codeExport).toBe(true);
  });

  it("every plan defines every limit as a non-negative number", () => {
    const keys = Object.keys(PLANS.free.limits).sort();
    for (const plan of Object.values(PLANS)) {
      expect(Object.keys(plan.limits).sort()).toEqual(keys);
      for (const v of Object.values(plan.limits)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("assertWithinLimit", () => {
  it("allows up to the limit and refuses beyond it", () => {
    expect(() => assertWithinLimit("free", "projects", 2)).not.toThrow();
    expect(() => assertWithinLimit("free", "projects", 3)).toThrow(LimitError);
    expect(() => assertWithinLimit("free", "projects", 1, 3)).toThrow(LimitError);
    expect(() => assertWithinLimit("pro", "projects", 10_000)).not.toThrow();
  });

  it("explains the limit and what to do", () => {
    try {
      assertWithinLimit("free", "projects", 3);
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ plan: "free", key: "projects", limit: 3, current: 3 });
      expect((e as Error).message).toBe(
        "The Free plan includes 3 projects. Delete a project you no longer need, or upgrade to Pro when it's available.",
      );
    }
  });
});

describe("planForWorkspace and usagePeriod", () => {
  it("defaults every workspace to Free until subscriptions exist", () => {
    expect(planForWorkspace({ id: "w" })).toBe("free");
  });

  it("uses UTC months", () => {
    expect(usagePeriod(new Date("2026-11-30T23:59:59Z"))).toBe("2026-11");
    expect(usagePeriod(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12");
  });
});

describe("code access (P6-4)", () => {
  it("lets Pro copy, export and push generated code, and Free only view it", () => {
    expect(codeAccess("free")).toEqual({ copy: false, export: false, githubPush: false });
    expect(codeAccess("pro")).toEqual({ copy: true, export: true, githubPush: true });
    expect(featureFor("free", "codeCopy")).toBe(false);
  });
});
