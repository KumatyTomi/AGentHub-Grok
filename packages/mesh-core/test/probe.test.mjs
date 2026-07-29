import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  probeEnvironment,
  envToMachinePatch,
  scanNodeMarkers,
  resolveLocalMachineId,
} from "../lib/probe.js";

test("probeEnvironment returns real host fields", () => {
  const env = probeEnvironment({ meshRoot: process.cwd(), nodeId: "beta" });
  assert.ok(env.probedAt);
  assert.equal(env.hostname, os.hostname());
  assert.ok(env.cpu.model && env.cpu.model.length > 2);
  assert.ok(env.cpu.cores >= 1);
  assert.ok(env.memory.totalBytes > 0);
  assert.ok(env.memory.totalGb > 0);
  assert.ok(env.primaryIp);
  assert.equal(env.tools.node, process.version);
  assert.equal(env.nodeId, "beta");
});

test("envToMachinePatch maps hardware for UI contract", () => {
  const env = probeEnvironment();
  const patch = envToMachinePatch(env);
  assert.ok(patch.hardware.cpu);
  assert.notEqual(patch.hardware.cpu, "—");
  assert.ok(patch.hardware.ramGb > 0);
  assert.equal(patch.status, "online");
  assert.ok(patch.environment.hostname);
  assert.ok(typeof patch.metrics.cpu === "number");
});

test("scanNodeMarkers reads installer node.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mesh-nodes-"));
  fs.mkdirSync(path.join(dir, "alpha"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "alpha", "node.json"),
    JSON.stringify({
      role: "kodowanie",
      ip: "10.20.0.10",
      hostname: "ALPHA-PC",
      installedAt: new Date().toISOString(),
      os: "Windows 11",
      extra: { codexMode: "local" },
    }),
  );
  const markers = scanNodeMarkers(dir);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].role, "kodowanie");
  assert.equal(markers[0].ip, "10.20.0.10");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("resolveLocalMachineId prefers MESH_NODE_ID", () => {
  const machines = [{ id: "alpha" }, { id: "beta" }, { id: "gamma" }];
  const prev = process.env.MESH_NODE_ID;
  process.env.MESH_NODE_ID = "gamma";
  try {
    assert.equal(resolveLocalMachineId(machines, { primaryIp: "1.2.3.4" }), "gamma");
  } finally {
    if (prev === undefined) delete process.env.MESH_NODE_ID;
    else process.env.MESH_NODE_ID = prev;
  }
});
