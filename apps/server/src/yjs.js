import * as http from "node:http";
import { WebSocketServer } from "ws";
import { setupWSConnection } from "y-websocket/bin/utils.js";

export function startYjsWebsocketServer({ port = 1234 } = {}) {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });

  wss.on("connection", (conn, req) => {
    setupWSConnection(conn, req, { gc: true });
  });

  server.listen(port);
  return { server, wss, port };
}

