import { uuidv7 } from "@truframe/db";
import { ApiFailure, apiError, json } from "@/lib/server/api";
import { receiveUpload } from "@/lib/server/assets";
import { getServerContext } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/**
 * The signed upload URL: the token in the path is the authorization (issued to a signed-in
 * member for one project, size-capped, 10 minutes). Returns the asset for the document.
 */
export async function PUT(request: Request, route: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await route.params;
    const asset = await receiveUpload(await getServerContext(), token, request, () => uuidv7());
    return json({ asset }, 201);
  } catch (e) {
    if (e instanceof ApiFailure) return apiError(e.code, e.message, e.status, e.details);
    console.error("upload failed", e instanceof Error ? e.message : "unknown error");
    return apiError("INTERNAL", "The upload failed. Try again.", 500);
  }
}
