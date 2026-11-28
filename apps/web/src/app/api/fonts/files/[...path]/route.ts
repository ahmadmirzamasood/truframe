import { notFound, withWorkspace } from "@/lib/server/api";
import { getServerContext } from "@/lib/server/context";
import { fontProxy } from "@/lib/server/pickers";

export const dynamic = "force-dynamic";

/** One Google Fonts file (woff2), by its path on fonts.gstatic.com. */
export const GET = withWorkspace<{ path: string[] }>(async (_ctx, _request, { path }) => {
  const file = await fontProxy(await getServerContext()).file(path.join("/"));
  if (!file) throw notFound();
  return new Response(file, {
    headers: {
      "content-type": "font/woff2",
      "x-content-type-options": "nosniff",
      // Google versions font URLs, so a file never changes.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
});
