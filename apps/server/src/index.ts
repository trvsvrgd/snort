import { createApp, ensureTopicsDir } from "./app.js";
import { startMcpStdio } from "./mcp.js";
import { startYjsWebsocketServer } from "./yjs.js";
import { proposeEditImpl } from "./proposeEdit.js";
import { log } from "./logger.js";

const PORT = Number(process.env.PORT ?? 5174);

const app = createApp();

app.listen(PORT, async () => {
  await ensureTopicsDir();
  log.info(`SNORT API listening on http://localhost:${PORT}`);
});

startYjsWebsocketServer({ port: Number(process.env.YJS_PORT ?? 1234) });

if (process.env.MCP_STDIO === "1") {
  startMcpStdio({ proposeEditImpl }).catch((err: unknown) => {
    log.error("MCP stdio server error", err);
    process.exitCode = 1;
  });
}
