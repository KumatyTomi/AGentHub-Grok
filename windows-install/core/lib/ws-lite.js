/**
 * Minimal WebSocket server (RFC6455) — zero npm deps.
 * Supports text frames only; enough for agentmesh-console /v1/events.
 */
import crypto from "node:crypto";

function acceptKey(key) {
  return crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
}

function encodeText(str) {
  const payload = Buffer.from(str, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

export class WebSocketServer {
  /**
   * @param {import('node:http').Server} server
   * @param {string} path
   */
  constructor(server, path = "/v1/events") {
    this.path = path;
    this.clients = new Set();
    server.on("upgrade", (req, socket, head) => {
      try {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        if (url.pathname !== this.path) {
          socket.destroy();
          return;
        }
        const key = req.headers["sec-websocket-key"];
        if (!key) {
          socket.destroy();
          return;
        }
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${acceptKey(key)}`,
          "\r\n",
        ].join("\r\n");
        socket.write(headers);
        if (head?.length) socket.unshift(head);
        this.clients.add(socket);
        socket.on("close", () => this.clients.delete(socket));
        socket.on("error", () => this.clients.delete(socket));
        // ignore inbound frames (read & discard)
        socket.on("data", () => {});
      } catch {
        try {
          socket.destroy();
        } catch {
          /* */
        }
      }
    });
  }

  clientCount() {
    return this.clients.size;
  }

  broadcast(text) {
    const frame = encodeText(text);
    for (const s of this.clients) {
      try {
        s.write(frame);
      } catch {
        this.clients.delete(s);
      }
    }
  }
}
