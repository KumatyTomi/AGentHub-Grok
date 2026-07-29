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
  assert.equal(j.version, "0.3.0");
  assert.equal(j.cluster, "TEST-MESH");
  assert.equal(j.environmentProbed, true);
  assert.equal(j.localMachineId, "beta");
  assert.ok(j.hostname);
});

test("GET /v1/env returns real host hardware", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/env`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.ok(j.environment.cpu.model);
  assert.notEqual(j.environment.cpu.model, "—");
  assert.ok(j.environment.memory.totalGb > 0);
  assert.equal(j.environment.hostname, os.hostname());
});

test("snapshot beta has real hardware from probe", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/cluster/snapshot`);
  const j = await r.json();
  assert.equal(j.config.mode, "local");
  assert.equal(j.config.environmentProbed, true);
  assert.equal(j.machines.length, 3);
  const beta = j.machines.find((m) => m.id === "beta");
  assert.ok(beta);
  assert.equal(beta.status, "online");
  assert.ok(beta.hardware.cpu);
  assert.notEqual(beta.hardware.cpu, "—");
  assert.ok(beta.hardware.ramGb > 0);
  assert.ok(beta.environment?.hostname);
});

test("node.json markers scanned into meta path via alpha host", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/cluster/snapshot`);
  const j = await r.json();
  const alpha = j.machines.find((m) => m.id === "alpha");
  assert.equal(alpha.host, "10.20.0.10");
  assert.ok(alpha.hasMarker === true || alpha.os === "Windows 11");
});

test("POST env/probe refreshes local machine", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/env/probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.accepted, true);
  assert.equal(j.machineId, "beta");
  assert.ok(j.environment.cpu.model);
});

test("POST machines/heartbeat with environment payload", async () => {
  let r = await fetch(`http://127.0.0.1:${PORT}/v1/machines/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "gamma",
      host: "10.20.0.30",
      replicaHealth: 100,
      hardware: { cpu: "Test GPU Host CPU", gpu: "RTX Test", ramGb: 64, vramGb: 16, diskTb: 2 },
      metrics: { cpu: 33, ram: 40, vram: 10, disk: 20, network: 5, tempCpu: 50, tempGpu: 60, throttling: false },
      environment: {
        hostname: "GAMMA-TEST",
        platform: "linux",
        primaryIp: "10.20.0.30",
        probedAt: new Date().toISOString(),
      },
    }),
  });
  assert.equal(r.status, 200);
  r = await fetch(`http://127.0.0.1:${PORT}/v1/cluster/snapshot`);
  const j = await r.json();
  const gamma = j.machines.find((m) => m.id === "gamma");
  assert.equal(gamma.status, "online");
  assert.equal(gamma.hardware.cpu, "Test GPU Host CPU");
  assert.equal(gamma.environment.hostname, "GAMMA-TEST");
});

test("POST tasks/create + set-role", async () => {
  let r = await fetch(`http://127.0.0.1:${PORT}/v1/tasks/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Test task", assignedTo: "alpha" }),
  });
  assert.equal(r.status, 200);
  let j = await r.json();
  assert.equal(j.accepted, true);
  assert.ok(j.task?.id);

  r = await fetch(`http://127.0.0.1:${PORT}/v1/machines/set-role`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "alpha", role: "renderowanie" }),
  });
  assert.equal(r.status, 200);

  r = await fetch(`http://127.0.0.1:${PORT}/v1/cluster/snapshot`);
  j = await r.json();
  assert.ok(j.tasks.length >= 1);
  assert.equal(j.machines.find((m) => m.id === "alpha").role, "renderowanie");
});

test("PIN guards sensitive commands", async () => {
  await fetch(`http://127.0.0.1:${PORT}/v1/pin/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: "123456" }),
  });
  let r = await fetch(`http://127.0.0.1:${PORT}/v1/cluster/revoke-invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(r.status, 403);

  r = await fetch(`http://127.0.0.1:${PORT}/v1/cluster/revoke-invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: "123456" }),
  });
  assert.equal(r.status, 200);
});

test("UI index served", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /mesh-core/);
  assert.match(html, /sonda/i);
});
