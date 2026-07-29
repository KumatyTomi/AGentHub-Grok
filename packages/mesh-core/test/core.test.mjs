import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PORT = 18765;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "mesh-core-test-"));
const MESH_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "mesh-root-"));

// installer-style marker that core must read
fs.mkdirSync(path.join(MESH_ROOT, "alpha"), { recursive: true });
fs.writeFileSync(
  path.join(MESH_ROOT, "alpha", "node.json"),
  JSON.stringify({
    role: "kodowanie",
    ip: "10.20.0.10",
    hostname: "ALPHA-TEST",
    installedAt: new Date().toISOString(),
    os: "Windows 11",
    extra: { codexMode: "local" },
  }),
);

let child;

before(async () => {
  child = spawn(process.execPath, [path.join(root, "server.mjs")], {
    env: {
      ...process.env,
      CORE_PORT: String(PORT),
      CORE_HOST: "127.0.0.1",
      MESH_DATA: DATA,
      MESH_ROOT,
      CLUSTER_NAME: "TEST-MESH",
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
  throw new Error("core did not start");
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

test("GET /v1/health includes probe flags", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/health`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.version, "0.3.1");
  assert.equal(j.cluster, "TEST-MESH");
  assert.equal(j.environmentProbed, true);
  assert.equal(j.localMachineId, "beta");
  assert.ok(j.hostname);
  assert.equal(j.metrics, "/metrics");
});

test("GET /v1/env returns real host hardware", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/env`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.ok(j.environment);
  assert.ok(j.environment.hostname);
  assert.ok(j.environment.cpu?.model);
  assert.ok(j.environment.memory?.totalGb > 0);
});

test("snapshot merges node.json marker for alpha", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/cluster/snapshot`);
  const j = await r.json();
  const alpha = j.machines.find((m) => m.id === "alpha");
  assert.ok(alpha);
  assert.equal(alpha.host, "10.20.0.10");
});

test("heartbeat with hardware updates machine", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/machines/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "alpha",
      host: "10.20.0.10",
      metrics: { cpu: 33, ram: 40, vram: 10, disk: 20, network: 5, tempCpu: 50, tempGpu: 60, throttling: false },
      hardware: { cpu: "Ryzen", gpu: "—", ramGb: 64, vramGb: 0, diskTb: 2 },
    }),
  });
  assert.equal(r.status, 200);
  const snap = await (await fetch(`http://127.0.0.1:${PORT}/v1/cluster/snapshot`)).json();
  const alpha = snap.machines.find((m) => m.id === "alpha");
  assert.equal(alpha.status, "online");
  assert.equal(alpha.metrics.cpu, 33);
  assert.ok(alpha.hardware.cpu.includes("Ryzen") || alpha.hardware.cpu === "Ryzen");
});

test("POST env/probe works", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/env/probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.accepted, true);
  assert.ok(j.environment?.hostname);
});
