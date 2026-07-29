#!/usr/bin/env node
/**
 * node-agent — lekka sonda + heartbeat do mesh-core.
 *
 * Uruchom na ALPHA / GAMMA (i opcjonalnie BETA):
 *   MESH_NODE_ID=alpha CORE_ENDPOINT=http://10.20.0.20:8765 node scripts/node-agent.mjs
 *
 * Env:
 *   CORE_ENDPOINT   default http://127.0.0.1:8765
 *   MESH_NODE_ID    alpha | beta | gamma | custom id
 *   MESH_ROLE       opcjonalna rola
 *   MESH_ROOT       magazyn (dysk)
 *   HEARTBEAT_MS    default 5000
 *   ONCE            =1  → jeden strzał i exit
 */
import { probeEnvironment, envToMachinePatch } from "../lib/probe.js";

const endpoint = (process.env.CORE_ENDPOINT || "http://127.0.0.1:8765").replace(/\/+$/, "");
const nodeId = process.env.MESH_NODE_ID || "alpha";
const role = process.env.MESH_ROLE || null;
const meshRoot = process.env.MESH_ROOT || process.cwd();
const interval = Math.max(2000, Number(process.env.HEARTBEAT_MS || 5000));
const once = process.env.ONCE === "1" || process.argv.includes("--once");

async function beat() {
  const env = probeEnvironment({ meshRoot, nodeId, role });
  const patch = envToMachinePatch(env);
  const body = {
    id: nodeId,
    metrics: patch.metrics,
    hardware: patch.hardware,
    environment: patch.environment,
    host: patch.host,
    os: patch.os,
    hostname: patch.hostname,
    replicaHealth: 100,
    role: role || undefined,
  };

  const t0 = Date.now();
  try {
    const r = await fetch(`${endpoint}/v1/machines/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json().catch(() => ({}));
    const ms = Date.now() - t0;
    if (!r.ok) {
      console.error(`[node-agent] FAIL ${r.status} ${j.error || ""} (${ms}ms)`);
      return false;
    }
    console.log(
      `[node-agent] OK id=${nodeId} host=${patch.host} cpu=${patch.hardware.cpu.slice(0, 40)} (${ms}ms)`,
    );
    return true;
  } catch (e) {
    console.error(`[node-agent] error: ${e.message}`);
    return false;
  }
}

console.log(`[node-agent] → ${endpoint} as ${nodeId} every ${interval}ms`);
const ok = await beat();
if (once) process.exit(ok ? 0 : 1);

setInterval(() => {
  void beat();
}, interval);
