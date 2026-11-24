/**
 * Plan limits: the one config every feature reads (docs/product/BILLING.md §2–§3).
 * Numbers are the BILLING.md proposal; changing them is an owner decision. Enforcement is
 * server-side only (`assertWithinLimit`, or atomic checks in the repos that take a limit).
 */

export const UNLIMITED = Number.POSITIVE_INFINITY;

const MB = 1024 * 1024;
const GB = 1024 * MB;

export type PlanId = "free" | "pro";

export type PlanLimits = {
  /** Active (not deleted) projects per workspace. */
  projects: number;
  pagesPerProject: number;
  activeTempLinks: number;
  tempLinkMaxDays: number;
  /** Projects published to Vercel. */
  vercelProjects: number;
  assetStorageBytes: number;
  assetFiles: number;
  assetFileBytes: number;
  agentCreditsPerMonth: number;
  agentToolCallsPerTurn: number;
  concurrentAgentRuns: number;
  mcpCallsPerMonth: number;
  mcpCallsPerMinute: number;
  mcpClients: number;
  customSkills: number;
  historyDays: number;
  namedVersions: number;
  imageExportMaxScale: number;
};

export type PlanFeatures = {
  codeCopy: boolean;
  codeExport: boolean;
  githubPush: boolean;
  clientReview: boolean;
  tempLinkPassword: boolean;
  byoAnthropicKey: boolean;
  /** "Made with Truframe" badge on temp links and Vercel deploys. */
  badge: boolean;
};

export type Plan = { id: PlanId; name: string; limits: PlanLimits; features: PlanFeatures };

export const PLANS: Readonly<Record<PlanId, Plan>> = {
  free: {
    id: "free",
    name: "Free",
    limits: {
      projects: 3,
      pagesPerProject: 5,
      activeTempLinks: 1,
      tempLinkMaxDays: 7,
      vercelProjects: 1,
      assetStorageBytes: 250 * MB,
      assetFiles: 100,
      assetFileBytes: 5 * MB,
      agentCreditsPerMonth: 30,
      agentToolCallsPerTurn: 25,
      concurrentAgentRuns: 1,
      mcpCallsPerMonth: 500,
      mcpCallsPerMinute: 20,
      mcpClients: 1,
      customSkills: 0,
      historyDays: 7,
      namedVersions: 3,
      imageExportMaxScale: 2,
    },
    features: {
      codeCopy: false,
      codeExport: false,
      githubPush: false,
      clientReview: false,
      tempLinkPassword: false,
      byoAnthropicKey: false,
      badge: true,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    limits: {
      projects: UNLIMITED,
      pagesPerProject: 150,
      activeTempLinks: 25,
      tempLinkMaxDays: 90,
      vercelProjects: UNLIMITED,
      assetStorageBytes: 25 * GB,
      assetFiles: 10_000,
      assetFileBytes: 50 * MB,
      agentCreditsPerMonth: 1_500,
      agentToolCallsPerTurn: 100,
      concurrentAgentRuns: 3,
      mcpCallsPerMonth: 20_000,
      mcpCallsPerMinute: 120,
      mcpClients: 10,
      customSkills: 50,
      historyDays: 365,
      namedVersions: UNLIMITED,
      imageExportMaxScale: 4,
    },
    features: {
      codeCopy: true,
      codeExport: true,
      githubPush: true,
      clientReview: true,
      tempLinkPassword: true,
      byoAnthropicKey: true,
      badge: false,
    },
  },
};

export type LimitKey = keyof PlanLimits;

export function limitFor(plan: PlanId, key: LimitKey): number {
  return PLANS[plan].limits[key];
}

/** Human copy for a limit, used in errors ("3 projects"). */
const LIMIT_NOUN: Partial<Record<LimitKey, [string, string]>> = {
  projects: ["project", "projects"],
  pagesPerProject: ["page per project", "pages per project"],
  activeTempLinks: ["active temporary link", "active temporary links"],
};

export class LimitError extends Error {
  readonly plan: PlanId;
  readonly key: LimitKey;
  readonly limit: number;
  readonly current: number;

  constructor(plan: PlanId, key: LimitKey, limit: number, current: number) {
    const [one, many] = LIMIT_NOUN[key] ?? [key, key];
    super(
      `The ${PLANS[plan].name} plan includes ${limit} ${limit === 1 ? one : many}. ` +
        (key === "projects"
          ? "Delete a project you no longer need, or upgrade to Pro when it's available."
          : "Upgrade to Pro when it's available."),
    );
    this.plan = plan;
    this.key = key;
    this.limit = limit;
    this.current = current;
  }
}

/** Throws `LimitError` if `current + adding` would exceed the plan's limit. */
export function assertWithinLimit(plan: PlanId, key: LimitKey, current: number, adding = 1): void {
  const limit = limitFor(plan, key);
  if (current + adding > limit) throw new LimitError(plan, key, limit, current);
}

/**
 * The plan a workspace is on. Subscriptions arrive in P10; until then every workspace is Free.
 * Kept as one function so P10 changes a single place.
 */
export function planForWorkspace(_workspace: { id: string }): PlanId {
  return "free";
}

/** Monthly usage period key, e.g. `2026-11` (UTC). P10 switches to billing anniversaries. */
export function usagePeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}
