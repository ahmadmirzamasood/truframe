/** Remote MCP server and OAuth. Stub until its phase lands. Only Worker entrypoints may be exported from this module. */
const workerName = "truframe-mcp" as const;

export default {
  async fetch(): Promise<Response> {
    return Response.json({ worker: workerName, ok: true });
  },
} satisfies ExportedHandler<Env>;
