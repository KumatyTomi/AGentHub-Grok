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

let child;

before(async () => {
  child = spawn(process.execPath, [path.join(root, "server.mjs")], {
    env: {
      ...process.env,
      CORE_PORT: String(PORT),
      CORE_HOST: "127.0.0.1",
      MESH_DATA: DATA,
      CLUSTER_NAME: "TEST-MESH",
      BETA_IP: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // wait for listen
  for (let i = 0; i < 40; i++) {
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
  } catch {
    /* */
  }
});

test("GET /v1/health", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/health`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.version, "0.2.0");
  assert.equal(j.cluster, "TEST-MESH");
});

test("GET /v1/cluster/snapshot has 3 machines", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/cluster/snapshot`);
  const j = await r.json();
  assert.ok(j.config);
  assert.equal(j.config.mode, "local");
  assert.equal(j.machines.length, 3);
  assert.ok(j.machines.find((m) => m.id === "alpha"));
  assert.ok(j.machines.find((m) => m.id === "beta"));
  assert.ok(j.machines.find((m) => m.id === "gamma"));
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
});
