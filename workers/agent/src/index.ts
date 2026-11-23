/** AgentSession Durable Object: model loop, tools, metering. Stub until its phase lands. */
export const workerName = "truframe-agent" as const;

export default {
  async fetch(): Promise<Response> {
    return Response.json({ worker: workerName, ok: true });
  },
} satisfies ExportedHandler<Env>;
