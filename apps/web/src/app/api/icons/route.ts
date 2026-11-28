import { iconSearchQuery } from "@truframe/protocol";
import { json, withWorkspace } from "@/lib/server/api";
import { getServerContext } from "@/lib/server/context";
import { searchIcons } from "@/lib/server/pickers";

export const dynamic = "force-dynamic";

/** Icons matching a search, with their drawings (Icon picker). */
export const GET = withWorkspace(async (_ctx, request) => {
  const { q } = iconSearchQuery.parse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  return json(await searchIcons(await getServerContext(), q));
});
