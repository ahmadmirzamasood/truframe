/** ProjectRoom Durable Object: doc sync, revisions. Stub until its phase lands. */
export const workerName = "truframe-realtime" as const;

export default {
  async fetch(): Promise<Response> {
    return Response.json({ worker: workerName, ok: true });
  },
} satisfies ExportedHandler<Env>;
