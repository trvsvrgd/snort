import test from "node:test";
import assert from "node:assert/strict";
import { ensureBlockIds, extractBlocks } from "../src/blockIds.js";

test("ensureBlockIds inserts id line before each H2 missing one", () => {
  const md = "## First\n\nx\n\n## Second\n\ny\n";
  const out = ensureBlockIds(md);
  assert.match(out, /<!-- @id: [0-9a-f-]{36} -->\n## First/s);
  const lines = out.split("\n");
  const h2Lines = lines.filter((l) => /^##\s+/.test(l));
  assert.equal(h2Lines.length, 2);
});

test("extractBlocks maps id to section content", () => {
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const md = `<!-- @id: ${id} -->\n## Title\n\nBody line\n`;
  const blocks = extractBlocks(md);
  assert.equal(blocks.size, 1);
  assert.ok(blocks.get(id)?.includes("## Title"));
  assert.ok(blocks.get(id)?.includes("Body line"));
});

test("extractBlocks handles two sections", () => {
  const a = "11111111-1111-1111-1111-111111111111";
  const b = "22222222-2222-2222-2222-222222222222";
  const md = `<!-- @id: ${a} -->\n## A\n\na\n\n<!-- @id: ${b} -->\n## B\n\nb\n`;
  const blocks = extractBlocks(md);
  assert.equal(blocks.size, 2);
  assert.ok(blocks.get(a)?.includes("## A"));
  assert.ok(blocks.get(b)?.includes("## B"));
});
