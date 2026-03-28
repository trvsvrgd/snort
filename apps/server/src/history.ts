import fs from "node:fs/promises";
import crypto from "node:crypto";
import { historyDir, trackerPath } from "./paths.js";

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export type TrackerAuthor = "Human" | "LLM";
export type TrackerAction = "Add" | "Edit" | "Delete";

export interface TrackerEvent {
  block_id: string;
  timestamp: string;
  author: TrackerAuthor;
  action: TrackerAction;
  summary: string;
}

export interface TrackerData {
  version: number;
  events: TrackerEvent[];
}

const EMPTY_TRACKER: TrackerData = { version: 1, events: [] };

export async function readTracker(): Promise<TrackerData> {
  try {
    const raw = await fs.readFile(trackerPath, "utf8");
    return JSON.parse(raw) as TrackerData;
  } catch (err) {
    if (nodeErrCode(err) === "ENOENT") {
      return { ...EMPTY_TRACKER, events: [...EMPTY_TRACKER.events] };
    }
    throw err;
  }
}

function nodeErrCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

export async function appendEvents(events: TrackerEvent[]): Promise<TrackerData> {
  await fs.mkdir(historyDir, { recursive: true });
  const tracker = await readTracker();
  tracker.events.push(...events);
  await fs.writeFile(trackerPath, JSON.stringify(tracker, null, 2), "utf8");
  return tracker;
}

export function diffBlocks({
  beforeBlocks,
  afterBlocks,
  author
}: {
  beforeBlocks: Map<string, string>;
  afterBlocks: Map<string, string>;
  author: TrackerAuthor;
}): TrackerEvent[] {
  const now = new Date().toISOString();
  const events: TrackerEvent[] = [];

  const before = new Map<string, string>();
  for (const [id, content] of beforeBlocks.entries()) before.set(id, sha256(content));

  const after = new Map<string, string>();
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
