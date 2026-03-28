import fs from "node:fs/promises";
import path from "node:path";
import { topicsDir } from "./paths.js";
import { HttpError } from "./httpErrors.js";

export function assertMarkdownTopicName(name: string): void {
  const base = path.basename(name);
  if (!base || base !== name || !base.endsWith(".md")) {
    throw new HttpError(400, "Topic name must be a single .md filename (no paths).", {
      code: "INVALID_TOPIC_NAME"
    });
  }
}

export async function readTopicFile(name: string): Promise<string> {
  assertMarkdownTopicName(name);
  const safe = path.basename(name);
  const full = path.join(topicsDir, safe);
  return fs.readFile(full, "utf8");
}

export async function writeTopicFile(name: string, markdown: string): Promise<void> {
  assertMarkdownTopicName(name);
  const safe = path.basename(name);
  const full = path.join(topicsDir, safe);
  await fs.writeFile(full, markdown, "utf8");
}
