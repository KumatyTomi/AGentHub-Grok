#!/usr/bin/env node
/** Local doctor — ping core, env probe, Ollama/Codex presence */
import { execSync } from "node:child_process";
import { probeEnvironment } from "../lib/probe.js";

const endpoint = (process.env.CORE_ENDPOINT || "http://127.0.0.1:8765").replace(/\/+$/, "");
const gamma = process.env.GAMMA_IP || "10.20.0.30";

function ok(m) {
  console.log("  [OK]  " + m);
}
function bad(m) {
  console.log("  [ERR] " + m);
}
function info(m) {
  console.log("  [..]  " + m);
}

console.log("AGentHub mesh-core doctor (0.3 · sonda)\n");

// Local probe always runs even if core is down
try {
  const env = probeEnvironment({ meshRoot: process.env.MESH_ROOT || process.cwd() });
  ok(`local probe: ${env.hostname} · ${env.primaryIp}`);
  info(`cpu: ${env.cpu.model} (${env.cpu.cores} cores)`);
  info(`ram: ${env.memory.totalGb} GB · used ${env.memory.usedPercent}%`);
  if (env.gpu) info(`gpu: ${env.gpu.name}`);
  else info("gpu: not detected");
  info(
    `tools: node=${env.tools.node} codex=${env.tools.codex} git=${env.tools.git} ollama=${env.tools.ollama}`,
  );
} catch (e) {
  bad("local probe failed: " + e.message);
}

console.log("");

try {
  const r = await fetch(endpoint + "/v1/health", { signal: AbortSignal.timeout(3000) });
  const j = await r.json();
  if (j.ok)
    ok(
      `core ${endpoint} version=${j.version} cluster=${j.cluster} probed=${j.environmentProbed} local=${j.localMachineId}`,
    );
  else bad("core health not ok");
} catch (e) {
  bad(`core unreachable: ${e.message}`);
}

try {
  const r = await fetch(endpoint + "/v1/env", { signal: AbortSignal.timeout(3000) });
  const j = await r.json();
  if (j.ok && j.environment) {
    ok(`GET /v1/env hostname=${j.environment.hostname} machine=${j.localMachineId}`);
  } else bad("/v1/env failed");
} catch (e) {
  bad("/v1/env: " + e.message);
}

try {
  const r = await fetch(endpoint + "/v1/cluster/snapshot", { signal: AbortSignal.timeout(3000) });
  const s = await r.json();
  ok(`snapshot machines=${s.machines?.length} tasks=${s.tasks?.length}`);
  for (const m of s.machines || []) {
    const hw = m.hardware?.cpu || "—";
    const probed = m.environment ? "probed" : "no-probe";
    info(`${m.name} ${m.host} ${m.status} role=${m.role} · ${hw} · ${probed}`);
  }
} catch (e) {
  bad("snapshot failed: " + e.message);
}

try {
  const r = await fetch(`http://${gamma}:11434/api/tags`, { signal: AbortSignal.timeout(2000) });
  if (r.ok) ok(`Ollama GAMMA :11434 reachable`);
  else bad(`Ollama HTTP ${r.status}`);
} catch {
  info("Ollama GAMMA not reachable (OK if not installed yet)");
}

try {
  execSync("codex --version", { stdio: "pipe" });
  ok("codex CLI in PATH");
} catch {
  info("codex not in PATH on this machine (expected on ALPHA only)");
}

console.log("\ndone.");
