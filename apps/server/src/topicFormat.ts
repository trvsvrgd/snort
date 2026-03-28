import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { Ajv, type ValidateFunction, type ErrorObject } from "ajv";
import { createRequire } from "node:module";
import { topicsDir, templatesDir } from "./paths.js";
import { extractBlocks } from "./blockIds.js";

const require = createRequire(import.meta.url);
const addMetaSchema202012 = require("ajv/dist/refs/json-schema-2020-12").default as (this: Ajv) => void;

export async function listTopics(): Promise<string[]> {
  const entries = await fs.readdir(topicsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();
}

export function parseFrontmatter(markdown: string): { data: Record<string, unknown>; body: string } {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { data: {}, body: normalized };
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return { data: {}, body: normalized };
  const fmText = normalized.slice(4, end);
  const body = normalized.slice(end + "\n---\n".length);
  const loaded = yaml.load(fmText);
  const data = (loaded && typeof loaded === "object" && !Array.isArray(loaded) ? loaded : {}) as Record<
    string,
    unknown
  >;
  return { data, body };
}

export async function loadTemplate(schemaFile: string): Promise<unknown> {
  const full = path.join(templatesDir, schemaFile);
  const raw = await fs.readFile(full, "utf8");
  return JSON.parse(raw) as unknown;
}

export type ValidationResult = {
  ok: boolean;
  schemaFile: string | null;
  errors: string[];
  structured: unknown;
};

export async function validateTopicAgainstTemplate(markdown: string): Promise<ValidationResult> {
  const { data, body } = parseFrontmatter(markdown);
  const rawTemplate = data.template;
  const schemaFile = typeof rawTemplate === "string" ? rawTemplate : undefined;

  if (!schemaFile) {
    return {
      ok: false,
      schemaFile: null,
      errors: ["Missing frontmatter field: template"],
      structured: null
    };
  }

  let schema: unknown;
  try {
    schema = await loadTemplate(schemaFile);
  } catch (err) {
    if (nodeErrCode(err) === "ENOENT") {
      return {
        ok: false,
        schemaFile,
        errors: [
          `Template schema not found: ${schemaFile}. SNORT needs the matching file under /templates/.`
        ],
        structured: null
      };
    }
    throw err;
  }

  const blocks = extractBlocks(body);
  const sections: { id: string; title: string; body: string }[] = [];

  for (const [id, content] of blocks.entries()) {
    const lines = content.split("\n");
    const titleLineIdx = lines.findIndex((l) => l.startsWith("## "));
    const title = titleLineIdx >= 0 ? lines[titleLineIdx].replace(/^##\s+/, "").trim() : "Untitled";
    sections.push({ id, title, body: content });
  }

  const topicTitle = data.topic ?? data.title;
  const structured = {
    topic: typeof topicTitle === "string" ? topicTitle : path.basename(schemaFile, ".schema.json"),
    sections
  };

  let validate: ValidateFunction;
  try {
    const ajv = new Ajv({
      allErrors: true,
      allowUnionTypes: true,
      strict: false
    });
    addMetaSchema202012.call(ajv);
    validate = ajv.compile(schema as object);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      schemaFile,
      errors: [`Schema compile error: ${msg}`],
      structured
    };
  }

  const ok = validate(structured) as boolean;
  const ajvErrors = (validate.errors ?? []) as ErrorObject[];

  return {
    ok: Boolean(ok),
    schemaFile,
    errors: ajvErrors.map((e) => `${e.instancePath || "/"} ${e.message}`),
    structured
  };
}

function nodeErrCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}
