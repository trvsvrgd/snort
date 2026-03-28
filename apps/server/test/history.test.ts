import test from "node:test";
import assert from "node:assert/strict";
import { diffBlocks } from "../src/history.js";

test("diffBlocks detects add", () => {
  const before = new Map<string, string>();
  const after = new Map([["id-1", "<!-- @id: id-1 -->\n## A\n"]]);
  const events = diffBlocks({ beforeBlocks: before, afterBlocks: after, author: "Human" });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.action, "Add");
  assert.equal(events[0]?.block_id, "id-1");
});

test("diffBlocks detects edit when content hash changes", () => {
  const before = new Map([["id-1", "<!-- @id: id-1 -->\n## A\n\nold"]]);
  const after = new Map([["id-1", "<!-- @id: id-1 -->\n## A\n\nnew"]]);
  const events = diffBlocks({ beforeBlocks: before, afterBlocks: after, author: "LLM" });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.action, "Edit");
  assert.equal(events[0]?.author, "LLM");
});

test("diffBlocks detects delete", () => {
  const before = new Map([["id-1", "x"]]);
  const after = new Map<string, string>();
  const events = diffBlocks({ beforeBlocks: before, afterBlocks: after, author: "Human" });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.action, "Delete");
});

test("diffBlocks is empty when unchanged", () => {
  const body = "<!-- @id: id-1 -->\n## Same\n";
  const before = new Map([["id-1", body]]);
  const after = new Map([["id-1", body]]);
  const events = diffBlocks({ beforeBlocks: before, afterBlocks: after, author: "Human" });
  assert.equal(events.length, 0);
});
