import { json, withWorkspace } from "@/lib/server/api";
import { deleteAsset } from "@/lib/server/assets";
import { getServerContext } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/** Removes the asset's record and, when no other project uses the file, the stored file. */
export const DELETE = withWorkspace<{ projectId: string; assetId: string }>(
  async (ctx, _request, { projectId, assetId }) => {
    await deleteAsset(await getServerContext(), ctx, projectId, assetId);
    return json({ ok: true });
  },
);
