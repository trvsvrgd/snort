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
import { asyncHandler, errorMiddleware, HttpError } from "./httpErrors.js";
import { log } from "./logger.js";

const PORT = Number(process.env.PORT ?? 5174);

/**
 * @param {string} name
 */
function assertMarkdownTopicName(name) {
  const base = path.basename(name);
  if (!base || base !== name || !base.endsWith(".md")) {
    throw new HttpError(400, "Topic name must be a single .md filename (no paths).", {
      code: "INVALID_TOPIC_NAME"
    });
  }
}

/**
 * @param {string} name
 */
async function readTopicFile(name) {
  assertMarkdownTopicName(name);
  const safe = path.basename(name);
  const full = path.join(topicsDir, safe);
  const raw = await fs.readFile(full, "utf8");
  return raw;
}

/**
 * @param {string} name
 * @param {string} markdown
 */
async function writeTopicFile(name, markdown) {
  assertMarkdownTopicName(name);
  const safe = path.basename(name);
  const full = path.join(topicsDir, safe);
  await fs.writeFile(full, markdown, "utf8");
}

/**
 * Mock LLM proposal from block id, instruction, and tracker history.
 * @param {{ block_id?: unknown, instruction?: unknown, current_markdown?: unknown, tracker: { events: Array<{ block_id: string }> } }} args
 */
async function proposeEditImpl({ block_id, instruction, current_markdown: _current_markdown, tracker }) {
  const id = typeof block_id === "string" ? block_id.trim() : "";
  if (!id) {
    throw new HttpError(400, "propose_edit needs a block_id (SNORT can't aim at thin air).", {
      code: "MISSING_BLOCK_ID"
    });
  }
  const instr = typeof instruction === "string" ? instruction : "";
  if (!instr.trim()) {
    throw new HttpError(400, "Add an instruction so SNORT knows what to propose.", {
      code: "MISSING_INSTRUCTION"
    });
  }

  // MVP: mock proposal using history context (no external LLM call).
  const recent = tracker.events
    .filter((e) => e.block_id === id)
    .slice(-5);

  return {
    tool: "propose_edit",
    block_id: id,
    instruction: instr,
    context: {
      recent_history: recent
    },
    proposal: {
      action: "Edit",
      summary: "Proposed edit (mock). Apply to the selected block.",
      replacement_markdown: `<!-- @id: ${id} -->\n## (unchanged title)\n\n${instr}\n`
    }
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get(
  "/api/topics",
  asyncHandler(async (_req, res) => {
    const topics = await listTopics();
    res.json({ topics });
  })
);

app.get(
  "/api/topics/:name",
  asyncHandler(async (req, res) => {
    const name = req.params.name;
    const markdown = await readTopicFile(name);
    const validated = await validateTopicAgainstTemplate(markdown);
    res.json({ name, markdown, validation: validated });
  })
);

app.put(
  "/api/topics/:name",
  asyncHandler(async (req, res) => {
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
  })
);

app.get(
  "/api/history",
  asyncHandler(async (_req, res) => {
    const tracker = await readTracker();
    res.json(tracker);
  })
);

app.post(
  "/api/chat",
  asyncHandler(async (req, res) => {
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
  })
);

app.use(errorMiddleware);

app.listen(PORT, async () => {
  await fs.mkdir(topicsDir, { recursive: true });
  log.info(`SNORT API listening on http://localhost:${PORT}`);
});

startYjsWebsocketServer({ port: Number(process.env.YJS_PORT ?? 1234) });

if (process.env.MCP_STDIO === "1") {
  startMcpStdio({ proposeEditImpl }).catch((err) => {
    log.error("MCP stdio server error", err);
    process.exitCode = 1;
  });
}
