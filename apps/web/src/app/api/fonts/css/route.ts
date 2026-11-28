import { fontCssQuery } from "@truframe/protocol";
import { withWorkspace } from "@/lib/server/api";
import { getServerContext } from "@/lib/server/context";
import { fontProxy } from "@/lib/server/pickers";

export const dynamic = "force-dynamic";

/** @font-face CSS for catalog families, served through this app (the canvas's web fonts). */
export const GET = withWorkspace(async (_ctx, request) => {
  const { family } = fontCssQuery.parse({
    family: new URL(request.url).searchParams.getAll("family"),
  });
  let css: string;
  try {
    css = await fontProxy(await getServerContext()).css(family, "/api/fonts/files/");
  } catch {
    css = "/* Google Fonts couldn't be reached; system fonts are shown instead. */\n";
  }
  return new Response(css, {
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "private, max-age=86400",
    },
  });
});
