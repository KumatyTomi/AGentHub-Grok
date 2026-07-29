#!/usr/bin/env node
/**
 * AGentHub mesh-core v0.2 — lokalny rdzeń klastra (LAN only).
 *
 * Kontrakt zgodny z agentmesh-console:
 *   GET  /v1/health
 *   GET  /v1/cluster/snapshot
 *   POST /v1/{command}
 *   WS   /v1/events
 *
 * UI operatorskie: GET /  (embedded, local-only)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "./lib/ws-lite.js";
import { MeshStore } from "./lib/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CORE_PORT || process.env.PORT || 8765);
const HOST = process.env.CORE_HOST || "0.0.0.0";
const DATA =
  process.env.MESH_DATA ||
  path.join(process.env.MESH_ROOT || path.join(__dirname, "data"), "data");
const CLUSTER = process.env.CLUSTER_NAME || "MESH-LOCAL-01";
const ALPHA_IP = process.env.ALPHA_IP || "10.20.0.10";
const BETA_IP = process.env.BETA_IP || "10.20.0.20";
const GAMMA_IP = process.env.GAMMA_IP || "10.20.0.30";
const SSD = process.env.MESH_ROOT || process.env.SSD_PATH || "E:\\AgentMesh";

const store = new MeshStore(DATA, {
  clusterName: CLUSTER,
  endpoint: process.env.CORE_ENDPOINT || `http://${BETA_IP}:${PORT}`,
  ssdPath: SSD,
  alphaIp: ALPHA_IP,
  betaIp: BETA_IP,
  gammaIp: GAMMA_IP,
});

// Mark BETA online as coordinator host
const beta = store.snap.machines.find((m) => m.id === "beta");
if (beta) {
  beta.status = "online";
  beta.replicaHealth = 100;
  beta.integrity = "zweryfikowana";
  store.snap.config.endpoint = process.env.CORE_ENDPOINT || `http://${BETA_IP}:${PORT}`;
  store.save();
}

const PUBLIC = path.join(__dirname, "public");

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function sendJson(res, code, body) {
  const raw = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Operator-Pin",
    "Cache-Control": "no-store",
  });
  res.end(raw);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}

function serveStatic(req, res, url) {
  let rel = url.pathname === "/" ? "/index.html" : url.pathname;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return false;
  }
  res.writeHead(200, { "Content-Type": contentType(file) });
  fs.createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Operator-Pin",
    });
    res.end();
    return;
  }

  // API
  if (url.pathname === "/v1/health" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      version: "0.2.0",
      cluster: store.snap.config.clusterName,
      mode: "local",
      uptimeSec: Math.floor(process.uptime()),
      machinesOnline: store.snap.machines.filter((m) => m.status === "online").length,
    });
  }

  if (url.pathname === "/v1/cluster/snapshot" && req.method === "GET") {
    return sendJson(res, 200, store.getPublic());
  }

  if (url.pathname.startsWith("/v1/") && req.method === "POST") {
    const cmdPath = url.pathname.slice("/v1/".length);
    const body = await readBody(req);
    if (req.headers["x-operator-pin"] && !body.pin) {
      body.pin = req.headers["x-operator-pin"];
    }
    const result = store.command(cmdPath, body);
    if (!result.ok) {
      return sendJson(res, result.status || 400, {
        error: result.error || "error",
        path: cmdPath,
      });
    }
    return sendJson(res, 200, result.data);
  }

  // Static operator UI
  if (req.method === "GET" && serveStatic(req, res, url)) return;

  sendJson(res, 404, { error: "not found", path: url.pathname });
});

// WebSocket events (agentmesh-console subscribe)
const wss = new WebSocketServer(server, "/v1/events");
store.onEvent((n) => {
  wss.broadcast(JSON.stringify(n));
});

// Metrics tick every 5s
setInterval(() => {
  try {
    store.tick();
  } catch {
    /* ignore */
  }
}, 5000);

server.listen(PORT, HOST, () => {
  console.log(`[mesh-core 0.2.0] local-only · http://${HOST}:${PORT}`);
  console.log(`[mesh-core] data=${DATA}`);
  console.log(`[mesh-core] cluster=${store.snap.config.clusterName}`);
  console.log(`[mesh-core] UI=http://127.0.0.1:${PORT}/  API=/v1/health`);
});

process.on("SIGINT", () => {
  store.save();
  process.exit(0);
});
process.on("SIGTERM", () => {
  store.save();
  process.exit(0);
});
