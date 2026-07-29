/**
 * Sonda środowiska — odczyt REALNEGO hosta (bez npm deps).
 * Używana przy starcie mesh-core, w node-agent i w GET /v1/env.
 */
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function safeExec(cmd, args, timeoutMs = 2500) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

function listIpv4() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const [name, list] of Object.entries(ifaces || {})) {
    for (const addr of list || []) {
      if (addr.family !== "IPv4" && addr.family !== 4) continue;
      if (addr.internal) continue;
      out.push({ iface: name, address: addr.address, netmask: addr.netmask, mac: addr.mac });
    }
  }
  return out;
}

function diskUsage(rootPath) {
  const target = rootPath && fs.existsSync(rootPath) ? rootPath : process.cwd();
  try {
    if (typeof fs.statfsSync === "function") {
      const s = fs.statfsSync(target);
      const total = Number(s.blocks) * Number(s.bsize);
      const free = Number(s.bavail ?? s.bfree) * Number(s.bsize);
      const used = Math.max(0, total - free);
      const pct = total > 0 ? Math.round((used / total) * 100) : 0;
      return {
        path: target,
        totalBytes: total,
        freeBytes: free,
        usedBytes: used,
        usedPercent: pct,
        totalTb: Math.round((total / 1e12) * 100) / 100,
      };
    }
  } catch {
    /* fallthrough */
  }

  if (process.platform === "win32") {
    const drive = path.parse(target).root.replace(/\\$/, "") || "C:";
    const letter = drive.replace(":", "");
    const raw = safeExec("wmic", [
      "logicaldisk",
      "where",
      `DeviceID='${letter}:'`,
      "get",
      "Size,FreeSpace",
      "/value",
    ]);
    if (raw) {
      const sizeM = /Size=(\d+)/.exec(raw);
      const freeM = /FreeSpace=(\d+)/.exec(raw);
      if (sizeM && freeM) {
        const total = Number(sizeM[1]);
        const free = Number(freeM[1]);
        const used = Math.max(0, total - free);
        return {
          path: `${letter}:\\`,
          totalBytes: total,
          freeBytes: free,
          usedBytes: used,
          usedPercent: total > 0 ? Math.round((used / total) * 100) : 0,
          totalTb: Math.round((total / 1e12) * 100) / 100,
        };
      }
    }
  }
  return null;
}

function detectGpu() {
  const nvsmi = safeExec("nvidia-smi", [
    "--query-gpu=name,memory.total,utilization.gpu,temperature.gpu",
    "--format=csv,noheader,nounits",
  ]);
  if (nvsmi) {
    const line = nvsmi.split(/\r?\n/)[0];
    const parts = line.split(",").map((s) => s.trim());
    return {
      name: parts[0] || "NVIDIA GPU",
      vramMb: parts[1] ? Number(parts[1]) : 0,
      utilPercent: parts[2] ? Number(parts[2]) : 0,
      tempC: parts[3] ? Number(parts[3]) : 0,
      vendor: "nvidia",
    };
  }

  if (process.platform === "linux") {
    const lspci = safeExec("lspci", ["-mm"]);
    if (lspci) {
      const lines = lspci.split(/\r?\n/).filter((l) => /VGA|3D|Display/i.test(l));
      const any = lines[0];
      if (any) {
        const m = any.match(/"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"/);
        const name = m ? `${m[2]} ${m[3]}`.trim() : any.slice(0, 80);
        return { name, vramMb: 0, utilPercent: 0, tempC: 0, vendor: "unknown" };
      }
    }
  }

  if (process.platform === "win32") {
    const raw = safeExec("wmic", ["path", "win32_VideoController", "get", "Name", "/value"]);
    if (raw) {
      const names = [...raw.matchAll(/Name=(.+)/g)].map((m) => m[1].trim()).filter(Boolean);
      if (names.length) {
        return { name: names[0], vramMb: 0, utilPercent: 0, tempC: 0, vendor: "windows" };
      }
    }
  }

  return null;
}

function cpuUsagePercent() {
  const cores = Math.max(1, os.cpus()?.length || 1);
  const load = os.loadavg()?.[0] ?? 0;
  if (load > 0) {
    return Math.max(1, Math.min(99, Math.round((load / cores) * 100)));
  }
  const cpus = os.cpus() || [];
  if (!cpus.length) return 8;
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  if (total <= 0) return 8;
  const used = 1 - idle / total;
  return Math.max(1, Math.min(99, Math.round(used * 100)));
}

function commandExists(bin) {
  try {
    if (process.platform === "win32") {
      return Boolean(safeExec("where", [bin]));
    }
    return Boolean(safeExec("which", [bin]));
  } catch {
    return false;
  }
}

/**
 * @param {object} [opts]
 * @param {string} [opts.meshRoot]
 * @param {string} [opts.nodeId]
 * @param {string} [opts.role]
 * @param {boolean} [opts.light]  pomiń GPU / tools shell (tick)
 */
export function probeEnvironment(opts = {}) {
  const meshRoot = opts.meshRoot || process.env.MESH_ROOT || process.cwd();
  const light = Boolean(opts.light);
  const cpus = os.cpus() || [];
  const cpuModel = cpus[0]?.model?.replace(/\s+/g, " ").trim() || "unknown CPU";
  const cores = cpus.length;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramPct = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;
  const ips = listIpv4();
  const primaryIp = ips[0]?.address || "127.0.0.1";
  const disk = light ? null : diskUsage(meshRoot);
  const gpu = light ? null : detectGpu();
  const cpuPct = cpuUsagePercent();

  const tools = light
    ? { node: process.version }
    : {
        node: process.version,
        codex: commandExists("codex"),
        git: commandExists("git"),
        ollama: commandExists("ollama"),
      };

  return {
    probedAt: new Date().toISOString(),
    nodeId: opts.nodeId || process.env.MESH_NODE_ID || null,
    role: opts.role || process.env.MESH_ROLE || null,
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    type: os.type(),
    uptimeSec: Math.floor(os.uptime()),
    primaryIp,
    addresses: ips,
    cpu: {
      model: cpuModel,
      cores,
      usagePercent: cpuPct,
      loadAvg: os.loadavg(),
    },
    memory: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedBytes: usedMem,
      usedPercent: ramPct,
      totalGb: Math.round((totalMem / 1e9) * 10) / 10,
    },
    disk,
    gpu,
    tools,
    meshRoot,
    light,
    process: {
      pid: process.pid,
      node: process.version,
      cwd: process.cwd(),
    },
  };
}

export function envToMachinePatch(env) {
  const ramGb = env.memory?.totalGb ?? Math.round((env.memory?.totalBytes || 0) / 1e9);
  const vramGb = env.gpu?.vramMb ? Math.round(env.gpu.vramMb / 1024) : 0;
  const diskTb = env.disk?.totalTb ?? 0;
  const osLabel = [env.type || env.platform, env.release, env.arch].filter(Boolean).join(" ");

  const patch = {
    host: env.primaryIp || "127.0.0.1",
    os: osLabel || process.platform,
    hostname: env.hostname,
    lastSync: env.probedAt,
    status: "online",
    metrics: {
      cpu: env.cpu?.usagePercent ?? 0,
      ram: env.memory?.usedPercent ?? 0,
      vram: env.gpu?.utilPercent ?? 0,
      disk: env.disk?.usedPercent ?? 0,
      network: Math.min(90, (env.addresses?.length || 0) * 12),
      tempCpu: 0,
      tempGpu: env.gpu?.tempC ?? 0,
      throttling: (env.cpu?.usagePercent ?? 0) > 92 || (env.gpu?.tempC ?? 0) > 85,
    },
    hardware: {
      cpu: env.cpu?.model || "—",
      gpu: env.gpu?.name || "—",
      ramGb,
      vramGb,
      diskTb: diskTb || 0,
    },
    environment: {
      hostname: env.hostname,
      platform: env.platform,
      arch: env.arch,
      primaryIp: env.primaryIp,
      addresses: env.addresses,
      tools: env.tools,
      probedAt: env.probedAt,
      uptimeSec: env.uptimeSec,
      meshRoot: env.meshRoot,
    },
  };

  // light probe: don't wipe previously known gpu/disk
  if (env.light) {
    delete patch.hardware.gpu;
    if (!patch.metrics.disk) delete patch.metrics.disk;
    if (!patch.metrics.vram) delete patch.metrics.vram;
  }

  return patch;
}

export function scanNodeMarkers(meshRoot) {
  if (!meshRoot || !fs.existsSync(meshRoot)) return [];
  const found = [];
  const candidates = [
    path.join(meshRoot, "node.json"),
    path.join(meshRoot, "alpha", "node.json"),
    path.join(meshRoot, "beta", "node.json"),
    path.join(meshRoot, "gamma", "node.json"),
  ];

  try {
    for (const ent of fs.readdirSync(meshRoot, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        candidates.push(path.join(meshRoot, ent.name, "node.json"));
      }
    }
  } catch {
    /* */
  }

  const seen = new Set();
  for (const file of candidates) {
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      found.push({
        path: file,
        role: raw.role || null,
        ip: raw.ip || null,
        hostname: raw.hostname || null,
        installedAt: raw.installedAt || null,
        os: raw.os || null,
        extra: raw.extra || {},
      });
    } catch {
      /* skip */
    }
  }
  return found;
}

export function resolveLocalMachineId(machines, env, bootOpts = {}) {
  const forced = process.env.MESH_NODE_ID || bootOpts.nodeId;
  if (forced && machines.some((m) => m.id === forced)) return forced;

  const ip = env.primaryIp;
  if (ip) {
    const byHost = machines.find((m) => m.host === ip);
    if (byHost) return byHost.id;
  }

  const map = [
    [process.env.ALPHA_IP || bootOpts.alphaIp, "alpha"],
    [process.env.BETA_IP || bootOpts.betaIp, "beta"],
    [process.env.GAMMA_IP || bootOpts.gammaIp, "gamma"],
  ];
  for (const [addr, id] of map) {
    if (addr && addr === ip && machines.some((m) => m.id === id)) return id;
  }

  // mesh-core process is the coordinator by default
  if (machines.some((m) => m.id === "beta")) return "beta";
  return machines[0]?.id || null;
}
