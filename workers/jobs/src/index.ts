/** Queue consumers: build, publish, export, email, webhooks. Stub until P9. */
const workerName = "truframe-jobs" as const;

export default {
  async fetch(): Promise<Response> {
    return Response.json({ worker: workerName, ok: true });
  },
  async queue(batch): Promise<void> {
    // No job types exist yet; ack so nothing lands in the dead-letter queue during P0.
    for (const message of batch.messages) message.ack();
  },
} satisfies ExportedHandler<Env>;
