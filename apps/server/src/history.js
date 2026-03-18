import fs from "node:fs/promises";
import crypto from "node:crypto";
import { trackerPath } from "./paths.js";

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export async function readTracker() {
  const raw = await fs.readFile(trackerPath, "utf8");
  return JSON.parse(raw);
}

export async function appendEvents(events) {
  const tracker = await readTracker();
  tracker.events.push(...events);
  await fs.writeFile(trackerPath, JSON.stringify(tracker, null, 2), "utf8");
  return tracker;
}

export function diffBlocks({ beforeBlocks, afterBlocks, author }) {
  const now = new Date().toISOString();
  const events = [];

  const before = new Map();
  for (const [id, content] of beforeBlocks.entries()) before.set(id, sha256(content));

  const after = new Map();
  for (const [id, content] of afterBlocks.entries()) after.set(id, sha256(content));

  for (const [id, afterHash] of after.entries()) {
    if (!before.has(id)) {
      events.push({
        block_id: id,
        timestamp: now,
        author,
        action: "Add",
        summary: "Block added"
      });
      continue;
    }
    const beforeHash = before.get(id);
    if (beforeHash !== afterHash) {
      events.push({
        block_id: id,
        timestamp: now,
        author,
        action: "Edit",
        summary: "Block edited"
      });
    }
  }

  for (const id of before.keys()) {
    if (!after.has(id)) {
      events.push({
        block_id: id,
        timestamp: now,
        author,
        action: "Delete",
        summary: "Block deleted"
      });
    }
  }

  return events;
}

