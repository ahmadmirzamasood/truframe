import { uuidv7 } from "@truframe/db";
import { importPhotoInput } from "@truframe/protocol";
import { json, readJson, withWorkspace } from "@/lib/server/api";
import { getServerContext } from "@/lib/server/context";
import { importPhoto } from "@/lib/server/pickers";

export const dynamic = "force-dynamic";

/** Copies a stock photo into the project's assets; the asset comes back for `upsertAsset`. */
export const POST = withWorkspace<{ projectId: string }>(async (ctx, request, { projectId }) => {
  const { photoId } = importPhotoInput.parse(await readJson(request));
  const asset = await importPhoto(await getServerContext(), ctx, projectId, photoId, () =>
    uuidv7(),
  );
  return json({ asset }, 201);
});
