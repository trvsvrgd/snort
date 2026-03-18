import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import cors from "cors";
import { topicsDir } from "./paths.js";
import { ensureBlockIds, extractBlocks } from "./blockIds.js";
import { listTopics, validateTopicAgainstTemplate } from "./topicFormat.js";
import { appendEvents, diffBlocks, readTracker } from "./history.js";
import { startMcpStdio } from "./mcp.js";
import { startYjsWebsocketServer } from "./yjs.js";

const PORT = Number(process.env.PORT ?? 5174);

async function readTopicFile(name) {
  const safe = path.basename(name);
  const full = path.join(topicsDir, safe);
  const raw = await fs.readFile(full, "utf8");
  return raw;
}

async function writeTopicFile(name, markdown) {
  const safe = path.basename(name);
  const full = path.join(topicsDir, safe);
  await fs.writeFile(full, markdown, "utf8");
}

async function proposeEditImpl({ block_id, instruction, current_markdown, tracker }) {
  // MVP: mock proposal using history context (no external LLM call).
  // Returns a tool-like suggestion the UI can apply.
  const recent = tracker.events
    .filter((e) => e.block_id === block_id)
    .slice(-5);

  return {
    tool: "propose_edit",
    block_id,
    instruction,
    context: {
      recent_history: recent
    },
    proposal: {
      action: "Edit",
      summary: "Proposed edit (mock). Apply to the selected block.",
      replacement_markdown: `<!-- @id: ${block_id} -->\n## (unchanged title)\n\n${instruction}\n`
    }
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/topics", async (_req, res) => {
  const topics = await listTopics();
  res.json({ topics });
});

app.get("/api/topics/:name", async (req, res) => {
  const name = req.params.name;
  const markdown = await readTopicFile(name);
  const validated = await validateTopicAgainstTemplate(markdown);
  res.json({ name, markdown, validation: validated });
});

app.put("/api/topics/:name", async (req, res) => {
  const name = req.params.name;
  const author = req.body?.author === "LLM" ? "LLM" : "Human";
  const incoming = String(req.body?.markdown ?? "");

  const before = await readTopicFile(name);
  const beforeEnsured = ensureBlockIds(before);
  const afterEnsured = ensureBlockIds(incoming);

  const beforeBlocks = extractBlocks(beforeEnsured);
  const afterBlocks = extractBlocks(afterEnsured);
  const events = diffBlocks({ beforeBlocks, afterBlocks, author });
  if (events.length) await appendEvents(events);

  await writeTopicFile(name, afterEnsured);
  const validated = await validateTopicAgainstTemplate(afterEnsured);

  res.json({ ok: true, name, markdown: afterEnsured, validation: validated, events_added: events.length });
});

app.get("/api/history", async (_req, res) => {
  const tracker = await readTracker();
  res.json(tracker);
});

app.post("/api/chat", async (req, res) => {
  const { messages, tool } = req.body ?? {};

  if (tool?.name === "propose_edit") {
    const tracker = await readTracker();
    const result = await proposeEditImpl({
      block_id: tool.args?.block_id,
      instruction: tool.args?.instruction,
      current_markdown: tool.args?.current_markdown,
      tracker
    });
    res.json({ role: "assistant", content: result });
    return;
  }

  res.json({
    role: "assistant",
    content: {
      message:
        "Mock chat. Use the tool propose_edit with { block_id, instruction, current_markdown } to get a structured proposal.",
      echo: messages?.slice?.(-1)?.[0] ?? null
    }
  });
});

app.listen(PORT, async () => {
  // Ensure required dirs exist for MVP
  await fs.mkdir(topicsDir, { recursive: true });
  console.log(`ARFM server listening on http://localhost:${PORT}`);
});

startYjsWebsocketServer({ port: Number(process.env.YJS_PORT ?? 1234) });

// Optional: run MCP stdio server when requested (separate process style).
if (process.env.MCP_STDIO === "1") {
  startMcpStdio({ proposeEditImpl }).catch((err) => {
    console.error("MCP stdio server error", err);
    process.exitCode = 1;
  });
}

