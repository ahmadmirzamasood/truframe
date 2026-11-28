import "server-only";
/**
 * The usercontent origin Preview frames (P5-7, ARCHITECTURE §10). Must be a bare origin, https
 * outside local, and never the app's own origin: user content must not run on the app origin.
 * Null (Preview off, with a message in the editor) when unset or invalid.
 */
import { usercontentOrigin } from "@truframe/protocol";
import type { ServerContext } from "./context";

export function previewOrigin(server: ServerContext): string | null {
  const env = server.env as unknown as Record<string, string | undefined>;
  return usercontentOrigin(
    env.TRUFRAME_USERCONTENT_URL,
    server.authEnv.BETTER_AUTH_URL,
    server.authEnv.TRUFRAME_ENV,
  );
}
