import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getServerContext } from "./context";

export const getSession = cache(async () => {
  const { auth } = await getServerContext();
  return auth.api.getSession({ headers: await headers() });
});

/** For pages that need a signed-in user; sends everyone else to sign-in. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}
