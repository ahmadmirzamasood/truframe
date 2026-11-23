/** Queue consumers: build, publish, export, email, webhooks. Stub until its phase lands. */
export const workerName = "truframe-jobs" as const;

export default {
  async fetch(): Promise<Response> {
    return Response.json({ worker: workerName, ok: true });
  },
} satisfies ExportedHandler<Env>;
