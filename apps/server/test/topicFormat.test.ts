import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter, validateTopicAgainstTemplate } from "../src/topicFormat.js";
import { topicsDir } from "../src/paths.js";

test("parseFrontmatter extracts yaml and body", () => {
  const md = "---\ntemplate: vendor-evaluation.schema.json\ntopic: Acme\n---\n\n## Section\n\nHello\n";
  const { data, body } = parseFrontmatter(md);
  assert.equal(data.template, "vendor-evaluation.schema.json");
  assert.equal(data.topic, "Acme");
  assert.ok(body.includes("## Section"));
  assert.ok(!body.trimStart().startsWith("---"));
});

test("parseFrontmatter returns whole doc when no closing frontmatter", () => {
  const md = "---\nopen: true\n## Not frontmatter really";
  const { data, body } = parseFrontmatter(md);
  assert.deepEqual(data, {});
  assert.equal(body, md);
});

test("validateTopicAgainstTemplate loads repo vendor-evaluation topic", async () => {
  const full = path.join(topicsDir, "vendor-evaluation.md");
  const markdown = await fs.readFile(full, "utf8");
  const result = await validateTopicAgainstTemplate(markdown);
  assert.equal(typeof result.ok, "boolean");
  assert.ok(result.schemaFile);
  assert.ok(Array.isArray(result.errors));
  assert.ok(result.structured !== undefined);
});
