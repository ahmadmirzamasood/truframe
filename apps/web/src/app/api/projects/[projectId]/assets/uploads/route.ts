import { createUploadInput } from "@truframe/protocol";
import { json, readJson, withWorkspace } from "@/lib/server/api";
import { issueUpload } from "@/lib/server/assets";
import { getServerContext } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/** A signed, 10-minute URL to upload one file to this project. */
export const POST = withWorkspace<{ projectId: string }>(async (ctx, request, { projectId }) => {
  const input = createUploadInput.parse(await readJson(request));
  return json(await issueUpload(await getServerContext(), ctx, projectId, input), 201);
});
