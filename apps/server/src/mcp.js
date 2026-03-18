import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readTracker } from "./history.js";

export function createMcpServer({ proposeEditImpl }) {
  const server = new Server(
    { name: "arfm-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.tool(
    "propose_edit",
    {
      block_id: z.string(),
      instruction: z.string(),
      current_markdown: z.string().optional()
    },
    async ({ block_id, instruction, current_markdown }) => {
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
    }
  );

  return server;
}

export async function startMcpStdio({ proposeEditImpl }) {
  const server = createMcpServer({ proposeEditImpl });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

