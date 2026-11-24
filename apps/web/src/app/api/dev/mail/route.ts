import type { EmailMessage } from "@truframe/emails";
import { DEV_MAIL_PREFIX, getServerContext } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/** Local only: emails the dev sender "sent" to an address, newest last. 404 elsewhere. */
export async function GET(request: Request): Promise<Response> {
  const { env, authEnv } = await getServerContext();
  if (authEnv.TRUFRAME_ENV !== "local") return new Response("Not found", { status: 404 });
  const to = new URL(request.url).searchParams.get("to")?.toLowerCase();
  if (!to) return Response.json({ error: "Pass ?to=<email>" }, { status: 400 });
  const messages = (await env.CONFIG.get<EmailMessage[]>(`${DEV_MAIL_PREFIX}${to}`, "json")) ?? [];
  return Response.json(
    messages.map((m) => ({
      subject: m.subject,
      link: m.text.match(/https?:\/\/\S+/)?.[0] ?? null,
    })),
    { headers: { "cache-control": "no-store" } },
  );
}
