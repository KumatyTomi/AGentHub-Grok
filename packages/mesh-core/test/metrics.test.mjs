import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { renderPrometheus } from "../lib/metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PORT = 18766;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "mesh-metrics-"));
const MESH_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "mesh-metrics-root-"));

let child;

before(async () => {
  child = spawn(process.execPath, [path.join(root, "server.mjs")], {
    env: {
      ...process.env,
      CORE_PORT: String(PORT),
      CORE_HOST: "127.0.0.1",
      MESH_DATA: DATA,
      MESH_ROOT,
      CLUSTER_NAME: "METRICS-MESH",
      BETA_IP: "127.0.0.1",
      MESH_NODE_ID: "beta",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/v1/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("core did not start for metrics tests");
});

after(() => {
  child?.kill("SIGTERM");
  try {
    fs.rmSync(DATA, { recursive: true, force: true });
    fs.rmSync(MESH_ROOT, { recursive: true, force: true });
  } catch {
    /* */
  }
});

test("GET /metrics exposes Prometheus text", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/metrics`);
  assert.equal(r.status, 200);
  const ct = r.headers.get("content-type") || "";
  assert.ok(ct.includes("text/plain"));
  const body = await r.text();
  assert.ok(body.includes("mesh_up"));
  assert.ok(body.includes("mesh_machines_online"));
  assert.ok(body.includes("mesh_machine_up"));
  assert.ok(body.includes('cluster="METRICS-MESH"'));
  assert.ok(body.includes("mesh_environment_probed"));
  assert.ok(body.includes("# TYPE mesh_up gauge"));
});

test("GET /v1/metrics is alias", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/metrics`);
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.ok(body.includes("mesh_core_uptime_seconds"));
});

test("health advertises metrics path", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/health`);
  const j = await r.json();
  assert.equal(j.metrics, "/metrics");
  assert.equal(j.version, "0.3.1");
});

test("heartbeat shows up in metrics", async () => {
  await fetch(`http://127.0.0.1:${PORT}/v1/machines/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "alpha",
      host: "10.20.0.10",
      metrics: { cpu: 42, ram: 55, disk: 30, vram: 0, network: 1, tempCpu: 48, tempGpu: 0, throttling: false },
      hardware: { cpu: "TestCPU", ramGb: 32, gpu: "—", vramGb: 0, diskTb: 1 },
    }),
  });
  const body = await (await fetch(`http://127.0.0.1:${PORT}/metrics`)).text();
  assert.ok(body.includes('mesh_machine_up{') && body.includes('machine="alpha"'));
  assert.ok(/mesh_machine_cpu_percent\{[^}]*machine="alpha"[^}]*\} 42/.test(body));
});

test("renderPrometheus pure unit", () => {
  const fakeStore = {
    snap: {
      config: { clusterName: "U", environmentProbed: true },
      machines: [
        {
          id: "x",
          name: "X",
          host: "1.2.3.4",
          status: "online",
          role: "test",
          lastSync: new Date().toISOString(),
          replicaHealth: 100,
          activeTasks: 1,
          metrics: { cpu: 10, ram: 20, disk: 5, vram: 0, network: 0, tempCpu: 40, tempGpu: 0, throttling: false },
          hardware: { ramGb: 16, vramGb: 0, diskTb: 0.5 },
          environment: { tools: { node: true, ollama: false } },
        },
      ],
      tasks: [{ state: "kolejka" }],
      notifications: [],
      audit: [],
      integrations: [],
    },
    lastProbe: {
      hostname: "h",
      cpu: { usagePercent: 11 },
      memory: { usedPercent: 22 },
      disk: { usedPercent: 33 },
    },
  };
  const t = renderPrometheus(fakeStore, { version: "9.9.9", wsClients: 2 });
  assert.ok(t.includes("mesh_up"));
  assert.ok(t.includes('version="9.9.9"'));
  assert.ok(t.includes("mesh_ws_clients"));
  assert.ok(t.includes('tool="node"'));
  assert.ok(t.includes("mesh_local_cpu_percent"));
});
