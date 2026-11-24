import { getServerContext } from "@/lib/server/context";

export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const { auth } = await getServerContext();
  return auth.handler(request);
}

export const GET = handle;
export const POST = handle;
