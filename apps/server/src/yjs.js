import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";

// Minimal Yjs websocket server (MVP).
// We keep this tiny to avoid relying on private y-websocket internals.
// Protocol: each message is a JSON string:
// - { type: "sync", room, stateVector? }
// - { type: "update", room, update } where update is base64 of Y.encodeStateAsUpdate
const docs = new Map();

function getDoc(room) {
  let doc = docs.get(room);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(room, doc);
  }
  return doc;
}

function toB64(u8) {
  return Buffer.from(u8).toString("base64");
}

function fromB64(b64) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export function startYjsWebsocketServer({ port = 1234 } = {}) {
  const server = createServer();
  const wss = new WebSocketServer({ server });

  wss.on("connection", (conn, req) => {
    // room comes from path (/topic:vendor-evaluation.md) or query (?room=...)
    const url = new URL(req.url ?? "/", "http://localhost");
    const room = url.searchParams.get("room") ?? url.pathname.replace(/^\//, "") ?? "default";
    const doc = getDoc(room);

    // Send full state on connect
    const full = Y.encodeStateAsUpdate(doc);
    conn.send(JSON.stringify({ type: "update", room, update: toB64(full) }));

    conn.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg?.type === "update" && msg.room === room && typeof msg.update === "string") {
        const update = fromB64(msg.update);
        Y.applyUpdate(doc, update);
        // Broadcast to others
        for (const client of wss.clients) {
          if (client !== conn && client.readyState === 1) {
            client.send(JSON.stringify({ type: "update", room, update: msg.update }));
          }
        }
      }
    });
  });

  server.listen(port);
  return { server, wss, port };
}

