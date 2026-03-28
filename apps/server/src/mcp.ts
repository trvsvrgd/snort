import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readTracker } from "./history.js";
import { HttpError } from "./httpErrors.js";
import type { ProposeEditArgs } from "./proposeEdit.js";

export type ProposeEditImplFn = (args: ProposeEditArgs) => Promise<unknown>;

type ToolRegistrar = {
  tool: (
    name: string,
    schema: Record<string, z.ZodTypeAny>,
    handler: (args: {
      block_id: string;
      instruction: string;
      current_markdown?: string;
    }) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
  ) => void;
};

export function createMcpServer({ proposeEditImpl }: { proposeEditImpl: ProposeEditImplFn }): Server {
  const server = new Server(
    { name: "arfm-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  (server as unknown as ToolRegistrar).tool(
    "propose_edit",
    {
      block_id: z.string(),
      instruction: z.string(),
      current_markdown: z.string().optional()
    },
    async ({ block_id, instruction, current_markdown }) => {
      try {
        const tracker = await readTracker();
        const result = await proposeEditImpl({ block_id, instruction, current_markdown, tracker });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (e) {
        const msg = e instanceof HttpError ? e.message : e instanceof Error ? e.message : String(e);
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: msg }, null, 2) }]
        };
      }
    }
  );

  return server;
}

export async function startMcpStdio({ proposeEditImpl }: { proposeEditImpl: ProposeEditImplFn }): Promise<void> {
  const server = createMcpServer({ proposeEditImpl });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
