import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import Ajv from "ajv";
import { topicsDir, templatesDir } from "./paths.js";
import { extractBlocks } from "./blockIds.js";

export async function listTopics() {
  const entries = await fs.readdir(topicsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();
}

export function parseFrontmatter(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { data: {}, body: normalized };
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return { data: {}, body: normalized };
  const fmText = normalized.slice(4, end);
  const body = normalized.slice(end + "\n---\n".length);
  const data = yaml.load(fmText) ?? {};
  return { data, body };
}

export async function loadTemplate(schemaFile) {
  const full = path.join(templatesDir, schemaFile);
  const raw = await fs.readFile(full, "utf8");
  return JSON.parse(raw);
}

export async function validateTopicAgainstTemplate(markdown) {
  const { data, body } = parseFrontmatter(markdown);
  const schemaFile = data.template;
  if (!schemaFile) {
    return {
      ok: false,
      schemaFile: null,
      errors: ["Missing frontmatter field: template"],
      structured: null
    };
  }

  const schema = await loadTemplate(schemaFile);
  const blocks = extractBlocks(body);
  const sections = [];

  for (const [id, content] of blocks.entries()) {
    const lines = content.split("\n");
    const titleLineIdx = lines.findIndex((l) => l.startsWith("## "));
    const title = titleLineIdx >= 0 ? lines[titleLineIdx].replace(/^##\s+/, "").trim() : "Untitled";
    sections.push({ id, title, body: content });
  }

  const structured = {
    topic: data.topic ?? data.title ?? path.basename(schemaFile, ".schema.json"),
    sections
  };

  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  const validate = ajv.compile(schema);
  const ok = validate(structured);

  return {
    ok: Boolean(ok),
    schemaFile,
    errors: (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`),
    structured
  };
}

