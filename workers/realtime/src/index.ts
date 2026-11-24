import { roomTokenFromProtocols, verifyRoomToken } from "@truframe/protocol";
import { CLAIMS_HEADER, ProjectRoom } from "./room.ts";

const workerName = "truframe-realtime" as const;

export { ProjectRoom };

/**
 * Routes `GET /rooms/<projectId>` WebSocket upgrades to that project's ProjectRoom after
 * verifying the room token (HMAC, 5 minutes, bound to the project). Everything else is 404.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({ worker: workerName, ok: true });
    }
    const match = /^\/rooms\/([A-Za-z0-9-]{1,64})$/.exec(url.pathname);
    if (!match) return new Response("Not found", { status: 404 });
    if (request.method !== "GET" || request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const token = roomTokenFromProtocols(request.headers.get("Sec-WebSocket-Protocol"));
    if (!token) return new Response("Missing room token", { status: 401 });
    const verified = await verifyRoomToken(token, env.ROOM_TOKEN_SECRET);
    if (!verified.ok) return new Response(`Room token ${verified.reason}`, { status: 401 });
    const projectId = match[1] as string;
    if (verified.claims.pid !== projectId) {
      return new Response("This token is for another project", { status: 403 });
    }
    const headers = new Headers(request.headers);
    headers.set(CLAIMS_HEADER, JSON.stringify(verified.claims));
    return env.PROJECT_ROOM.getByName(projectId).fetch(new Request(request, { headers }));
  },
} satisfies ExportedHandler<Env>;
