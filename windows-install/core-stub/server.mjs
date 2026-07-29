/**
 * AGentHub-Grok — minimalny rdzeń LAN (stub).
 * Uruchom na BETA:  set CORE_PORT=8765 && node server.mjs
 * GET /v1/health
 * GET /v1/cluster/snapshot
 * POST /v1/*
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CORE_PORT || 8765);
const CLUSTER = process.env.CLUSTER_NAME || "MESH-LOCAL-01";
const DATA = process.env.MESH_DATA || path.join(__dirname, "data");
const ALPHA = process.env.ALPHA_IP || "10.20.0.10";
const BETA = process.env.BETA_IP || "10.20.0.20";
const GAMMA = process.env.GAMMA_IP || "10.20.0.30";

const snapshotPath = path.join(DATA, "snapshot.json");

function defaultSnapshot() {
  return {
    config: {
      clusterName: CLUSTER,
      endpoint: `http://${BETA}:${PORT}`,
      mode: "local",
      pinSet: true,
      onboarded: true,
    },
    machines: [
      { id: "alpha", name: "ALPHA", host: ALPHA, status: "online", role: "kodowanie" },
      { id: "beta", name: "BETA", host: BETA, status: "online", role: "koordynator" },
      { id: "gamma", name: "GAMMA", host: GAMMA, status: "online", role: "obliczenia" },
    ],
    tasks: [],
    projects: [],
    integrations: [
      {
        id: "ollama-gamma",
        name: "Ollama GAMMA",
        kind: "ai-adapter",
        baseUrl: `http://${GAMMA}:11434/v1`,
        enabled: true,
      },
    ],
    audit: [],
  };
}

function loadSnapshot() {
  try {
    if (fs.existsSync(snapshotPath)) {
      return JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    }
  } catch {}
  const s = defaultSnapshot();
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(s, null, 2));
  return s;
}

function saveSnapshot(s) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(s, null, 2));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const json = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/v1/health" && req.method === "GET") {
    return json(200, { ok: true, version: "local-stub-0.1.0", cluster: CLUSTER });
  }
  if (url.pathname === "/v1/cluster/snapshot" && req.method === "GET") {
    return json(200, loadSnapshot());
  }
  if (url.pathname.startsWith("/v1/") && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {}
    const s = loadSnapshot();
    s.audit = s.audit || [];
    s.audit.unshift({
      id: "a-" + Date.now(),
      at: new Date().toISOString(),
      actor: "operator",
      action: url.pathname,
      detail: JSON.stringify(body).slice(0, 200),
    });
    saveSnapshot(s);
    return json(200, { accepted: true, path: url.pathname });
  }
  json(404, { error: "not found", path: url.pathname });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[AGentHub-core] http://0.0.0.0:${PORT} cluster=${CLUSTER}`);
});
