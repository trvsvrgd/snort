import fs from "node:fs/promises";
import express from "express";
import cors from "cors";
import { topicsDir } from "./paths.js";
import { ensureBlockIds, extractBlocks } from "./blockIds.js";
import { listTopics, validateTopicAgainstTemplate } from "./topicFormat.js";
import { appendEvents, diffBlocks, readTracker } from "./history.js";
import { asyncHandler, errorMiddleware } from "./httpErrors.js";
import { readTopicFile, writeTopicFile } from "./topicFiles.js";
import { proposeEditImpl } from "./proposeEdit.js";

function routeParamName(p: string | string[] | undefined): string {
  if (p == null) return "";
  return Array.isArray(p) ? (p[0] ?? "") : p;
}

/**
 * Express application (routes + middleware). Does not call `listen`.
 * Used by the HTTP server entrypoint and integration tests.
 */
export function createApp(): express.Express {
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
      const name = routeParamName(req.params.name);
      const markdown = await readTopicFile(name);
      const validated = await validateTopicAgainstTemplate(markdown);
      res.json({ name, markdown, validation: validated });
    })
  );

  app.put(
    "/api/topics/:name",
    asyncHandler(async (req, res) => {
      const name = routeParamName(req.params.name);
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

  return app;
}

export async function ensureTopicsDir(): Promise<void> {
  await fs.mkdir(topicsDir, { recursive: true });
}
