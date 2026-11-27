import { withWorkspace } from "@/lib/server/api";
import { serveFile } from "@/lib/server/assets";
import { getServerContext } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/** A project file (`assets/<sha256>.<ext>`), `?w=` for a resized variant where available. */
export const GET = withWorkspace<{ projectId: string; key: string[] }>(
  async (ctx, request, { projectId, key }) => {
    const w = new URL(request.url).searchParams.get("w");
    return serveFile(await getServerContext(), ctx, projectId, key.join("/"), w ? Number(w) : null);
  },
);
