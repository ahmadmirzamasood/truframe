import { photoSearchQuery } from "@truframe/protocol";
import { json, withWorkspace } from "@/lib/server/api";
import { getServerContext } from "@/lib/server/context";
import { searchPhotos } from "@/lib/server/pickers";

export const dynamic = "force-dynamic";

/** Stock photos matching a search (Assets panel, Photos). */
export const GET = withWorkspace(async (_ctx, request) => {
  const p = new URL(request.url).searchParams;
  const { q, page } = photoSearchQuery.parse({
    q: p.get("q") ?? undefined,
    page: p.get("page") ?? undefined,
  });
  return json(await searchPhotos(await getServerContext(), q, page));
});
