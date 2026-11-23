import { DurableObject } from "cloudflare:workers";

const workerName = "truframe-agent" as const;

/** One session per agent run: model loop, tools, metering (P7-2). Stub. */
export class AgentSession extends DurableObject<Env> {
  override async fetch(): Promise<Response> {
    return Response.json({ durableObject: "AgentSession", ok: true });
  }
}

export default {
  async fetch(): Promise<Response> {
    return Response.json({ worker: workerName, ok: true });
  },
} satisfies ExportedHandler<Env>;
