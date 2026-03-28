import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";

test("GET /api/topics returns a sorted topic list", async () => {
  const app = createApp();
  const res = await request(app).get("/api/topics").expect(200);
  assert.ok(Array.isArray(res.body.topics));
  assert.ok(res.body.topics.includes("vendor-evaluation.md"));
});

test("GET /api/topics/:name returns markdown and validation", async () => {
  const app = createApp();
  const res = await request(app).get("/api/topics/vendor-evaluation.md").expect(200);
  assert.equal(res.body.name, "vendor-evaluation.md");
  assert.ok(typeof res.body.markdown === "string");
  assert.ok(res.body.validation);
  assert.equal(typeof res.body.validation.ok, "boolean");
});

test("GET /api/topics/missing-file-xyz.md returns 404 JSON error", async () => {
  const app = createApp();
  const res = await request(app).get("/api/topics/missing-file-xyz.md").expect(404);
  assert.equal(res.body.ok, false);
  assert.ok(typeof res.body.error === "string");
});

test("GET /api/history returns tracker shape", async () => {
  const app = createApp();
  const res = await request(app).get("/api/history").expect(200);
  assert.equal(typeof res.body.version, "number");
  assert.ok(Array.isArray(res.body.events));
});

test("POST /api/chat propose_edit validates block_id", async () => {
  const app = createApp();
  const res = await request(app)
    .post("/api/chat")
    .send({
      tool: {
        name: "propose_edit",
        args: { block_id: "", instruction: "fix" }
      }
    })
    .expect(400);
  assert.equal(res.body.ok, false);
  assert.ok(String(res.body.error).includes("block_id"));
});
