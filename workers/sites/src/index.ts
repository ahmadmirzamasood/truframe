/**
 * The user-content worker (a separate registrable domain from the app). Serves the Preview
 * shell (P5-7) and the Embed shell (P6-5) now; temporary links from R2 land in their own
 * phase. Only Worker entrypoints may be exported from this module.
 */
import { embedShell } from "./embed.ts";
import { appOrigin, previewShell } from "./preview.ts";

const workerName = "truframe-sites" as const;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health")
      return Response.json({ worker: workerName, ok: true });
    if (url.pathname === "/preview" && request.method === "GET") {
      const app = appOrigin(env);
      if (!app) return new Response("Preview isn't configured on this server.", { status: 503 });
      return previewShell(app, url.origin);
    }
    if (url.pathname === "/embed" && request.method === "GET") {
      const app = appOrigin(env);
      if (!app) return new Response("Embeds aren't configured on this server.", { status: 503 });
      return embedShell();
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
