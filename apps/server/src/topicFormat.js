import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import Ajv from "ajv";
import { createRequire } from "node:module";
import { topicsDir, templatesDir } from "./paths.js";
import { extractBlocks } from "./blockIds.js";

const require = createRequire(import.meta.url);
// Templates declare draft 2020-12, so we need Ajv to register the full
// draft 2020-12 meta-schema set (schema.json + meta/* pieces).
const addMetaSchema202012 = require("ajv/dist/refs/json-schema-2020-12").default;

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

  let schema;
  try {
    schema = await loadTemplate(schemaFile);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && /** @type {{ code?: string }} */ (err).code === "ENOENT") {
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

  let validate;
  try {
    const ajv = new Ajv({
      allErrors: true,
      allowUnionTypes: true,
      // Ajv's strict mode can complain about draft 2020-12 keywords depending
      // on configuration/version support. For this MVP we prefer validating
      // topics to returning "schema compile errors".
      strict: false,
    });
    // The meta-schema helper uses `this` internally (expects Ajv instance).
    addMetaSchema202012.call(ajv);
    validate = ajv.compile(schema);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      schemaFile,
      errors: [`Schema compile error: ${msg}`],
      structured
    };
  }

  const ok = validate(structured);

  return {
    ok: Boolean(ok),
    schemaFile,
    errors: (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`),
    structured
  };
}

