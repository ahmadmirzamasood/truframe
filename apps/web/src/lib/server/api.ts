import "server-only";
import { resolveWorkspace, WorkspaceAccessError, type WorkspaceContext } from "@truframe/auth";
import type { ApiErrorCode } from "@truframe/protocol";
import { ZodError } from "zod";
import { getServerContext } from "./context";

export class ApiFailure extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  return Response.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export const notFound = () =>
  new ApiFailure("NOT_FOUND", "That project doesn't exist or you can't access it.", 404);

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** JSON body parsed with a zod schema; malformed JSON counts as invalid input. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiFailure("INVALID_INPUT", "Send a JSON body.", 400);
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Wraps an API route: rejects cross-site writes (Origin must be the app), requires a session,
 * resolves the caller's workspace (personal, or `?workspace=` if they are a member) and maps
 * expected failures to typed JSON errors. Other workspaces' data is never reachable from here:
 * handlers only get repos bound to the resolved workspace.
 */
export function withWorkspace<P>(
  handler: (ctx: WorkspaceContext, request: Request, params: P) => Promise<Response>,
) {
  return async (request: Request, route: { params: Promise<P> }): Promise<Response> => {
    try {
      const { auth, authEnv, db } = await getServerContext();
      if (!SAFE_METHODS.has(request.method)) {
        const origin = request.headers.get("origin");
        if (origin !== new URL(authEnv.BETTER_AUTH_URL).origin) {
          return apiError("FORBIDDEN_ORIGIN", "Requests must come from the Truframe app.", 403);
        }
      }
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return apiError("UNAUTHENTICATED", "Sign in to continue.", 401);
      const workspaceId = new URL(request.url).searchParams.get("workspace");
      const ctx = await resolveWorkspace(db, session.user, workspaceId);
      return await handler(ctx, request, await route.params);
    } catch (e) {
      if (e instanceof ApiFailure) return apiError(e.code, e.message, e.status, e.details);
      if (e instanceof WorkspaceAccessError) {
        return apiError("NOT_FOUND", "That workspace doesn't exist or you can't access it.", 404);
      }
      if (e instanceof ZodError) {
        return apiError("INVALID_INPUT", e.issues[0]?.message ?? "Invalid input.", 400, {
          issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      console.error("api error", e instanceof Error ? e.name : "unknown");
      return apiError("INTERNAL", "Something went wrong on our side. Try again.", 500);
    }
  };
}
