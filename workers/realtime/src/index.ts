import { DurableObject } from "cloudflare:workers";

const workerName = "truframe-realtime" as const;

/** One room per project: doc sync, persistence, revisions (P2-5). Stub. */
export class ProjectRoom extends DurableObject<Env> {
  override async fetch(): Promise<Response> {
    return Response.json({ durableObject: "ProjectRoom", ok: true });
  }
}

export default {
  async fetch(): Promise<Response> {
    return Response.json({ worker: workerName, ok: true });
  },
} satisfies ExportedHandler<Env>;
