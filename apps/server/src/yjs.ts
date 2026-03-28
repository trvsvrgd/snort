import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import * as Y from "yjs";
import { log } from "./logger.js";

const docs = new Map<string, Y.Doc>();

function getDoc(room: string): Y.Doc {
  let doc = docs.get(room);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(room, doc);
  }
  return doc;
}

function toB64(u8: Uint8Array): string {
  return Buffer.from(u8).toString("base64");
}

function fromB64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

type YjsUpdateMessage = { type?: string; room?: string; update?: string };

export function startYjsWebsocketServer({ port = 1234 } = {}): {
  server: ReturnType<typeof createServer>;
  wss: WebSocketServer;
  port: number;
} {
  const server = createServer();
  const wss = new WebSocketServer({ server });

  wss.on("connection", (conn: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const room = url.searchParams.get("room") ?? (url.pathname.replace(/^\//, "") || "default");
    const doc = getDoc(room);

    const full = Y.encodeStateAsUpdate(doc);
    conn.send(JSON.stringify({ type: "update", room, update: toB64(full) }));

    conn.on("message", (data) => {
      let msg: YjsUpdateMessage;
      try {
        msg = JSON.parse(String(data)) as YjsUpdateMessage;
      } catch {
        return;
      }
      if (msg?.type === "update" && msg.room === room && typeof msg.update === "string") {
        const update = fromB64(msg.update);
        Y.applyUpdate(doc, update);
        for (const client of wss.clients) {
          if (client !== conn && client.readyState === 1) {
            client.send(JSON.stringify({ type: "update", room, update: msg.update }));
          }
        }
      }
    });
  });

  server.listen(port, () => {
    log.info(`Yjs collaboration socket on ws://localhost:${port}`);
  });
  return { server, wss, port };
}
