import { json, withWorkspace } from "@/lib/server/api";
import { storageUsage } from "@/lib/server/assets";

export const dynamic = "force-dynamic";

/** Storage used by the workspace against its plan (Assets panel meter). */
export const GET = withWorkspace<{ projectId: string }>(async (ctx) =>
  json({ usage: await storageUsage(ctx) }),
);
