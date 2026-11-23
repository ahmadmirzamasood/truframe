/** Remote MCP server and OAuth. Stub until its phase lands. */
export const workerName = "truframe-mcp" as const;

export default {
  async fetch(): Promise<Response> {
    return Response.json({ worker: workerName, ok: true });
  },
} satisfies ExportedHandler<Env>;
