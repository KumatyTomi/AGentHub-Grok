/**
 * Prometheus text exposition for mesh-core → Grafana.
 * GET /metrics  (also /v1/metrics)
 *
 * Zero npm deps. Labels: machine, name, role, host, status, cluster.
 */

function escLabel(v) {
  return String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

function labels(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${k}="${escLabel(v)}"`);
  }
  return parts.length ? `{${parts.join(",")}}` : "";
}

function num(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function statusCode(status) {
  switch (String(status || "").toLowerCase()) {
    case "online":
      return 1;
    case "synchronizacja":
    case "sync":
      return 2;
    case "kwarantanna":
    case "quarantine":
      return 3;
    case "offline":
    default:
      return 0;
  }
}

function ageSec(iso) {
  if (!iso) return -1;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return -1;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

/** tools may be boolean, version string, or null */
function toolPresent(v) {
  if (v === true || v === 1) return 1;
  if (v === false || v === 0 || v == null || v === "") return 0;
  return 1; // e.g. "v22.x.x" from process.version
}

/**
 * @param {object} store  MeshStore instance
 * @param {{ version?: string, wsClients?: number }} extra
 * @returns {string} Prometheus text
 */
export function renderPrometheus(store, extra = {}) {
  const snap = store.snap;
  const cluster = snap.config?.clusterName || "unknown";
  const lines = [];

  const help = (name, text, type = "gauge") => {
    lines.push(`# HELP ${name} ${text}`);
    lines.push(`# TYPE ${name} ${type}`);
  };

  help("mesh_up", "1 if mesh-core process is serving");
  lines.push(`mesh_up${labels({ cluster })} 1`);

  help("mesh_core_info", "Build/version info (always 1)");
  lines.push(
    `mesh_core_info${labels({
      cluster,
      version: extra.version || "0",
      mode: "local",
    })} 1`,
  );

  help("mesh_core_uptime_seconds", "Process uptime in seconds");
  lines.push(
    `mesh_core_uptime_seconds${labels({ cluster })} ${Math.floor(process.uptime())}`,
  );

  help("mesh_environment_probed", "1 if boot environment probe succeeded");
  lines.push(
    `mesh_environment_probed${labels({ cluster })} ${
      snap.config?.environmentProbed ? 1 : 0
    }`,
  );

  help("mesh_ws_clients", "Connected WebSocket event clients");
  lines.push(
    `mesh_ws_clients${labels({ cluster })} ${num(extra.wsClients, 0)}`,
  );

  help("mesh_machines", "Registered machines count");
  const machines = snap.machines || [];
  lines.push(`mesh_machines${labels({ cluster })} ${machines.length}`);

  const online = machines.filter((m) => m.status === "online").length;
  help("mesh_machines_online", "Machines with status=online");
  lines.push(`mesh_machines_online${labels({ cluster })} ${online}`);

  help(
    "mesh_machine_up",
    "1 if machine is online (from heartbeat / local probe)",
  );
  help(
    "mesh_machine_status",
    "Status code: 0=offline 1=online 2=sync 3=quarantine",
  );
  help(
    "mesh_machine_heartbeat_age_seconds",
    "Seconds since lastSync/heartbeat (-1 if never)",
  );
  help("mesh_machine_replica_health", "Replica health 0-100");
  help("mesh_machine_active_tasks", "Active tasks on machine");
  help("mesh_machine_cpu_percent", "CPU usage percent (from probe/heartbeat)");
  help("mesh_machine_ram_percent", "RAM usage percent");
  help("mesh_machine_vram_percent", "VRAM usage percent");
  help("mesh_machine_disk_percent", "Disk usage percent");
  help("mesh_machine_network_percent", "Network load percent (relative)");
  help("mesh_machine_temp_cpu_celsius", "CPU temperature C");
  help("mesh_machine_temp_gpu_celsius", "GPU temperature C");
  help("mesh_machine_throttling", "1 if throttling reported");
  help("mesh_machine_ram_total_gb", "Total RAM GB from hardware/env");
  help("mesh_machine_vram_total_gb", "Total VRAM GB");
  help("mesh_machine_disk_total_tb", "Total disk TB");
  help("mesh_machine_tool", "1 if tool detected on machine (from environment.tools)");

  for (const m of machines) {
    const base = {
      cluster,
      machine: m.id,
      name: m.name || m.id,
      role: m.role || "unknown",
      host: m.host || "",
      status: m.status || "offline",
    };
    const met = m.metrics || {};
    const hw = m.hardware || {};
    const env = m.environment || {};

    lines.push(`mesh_machine_up${labels(base)} ${m.status === "online" ? 1 : 0}`);
    lines.push(`mesh_machine_status${labels(base)} ${statusCode(m.status)}`);
    lines.push(
      `mesh_machine_heartbeat_age_seconds${labels(base)} ${ageSec(m.lastSync)}`,
    );
    lines.push(
      `mesh_machine_replica_health${labels(base)} ${num(m.replicaHealth, 0)}`,
    );
    lines.push(
      `mesh_machine_active_tasks${labels(base)} ${num(m.activeTasks, 0)}`,
    );
    lines.push(`mesh_machine_cpu_percent${labels(base)} ${num(met.cpu, 0)}`);
    lines.push(`mesh_machine_ram_percent${labels(base)} ${num(met.ram, 0)}`);
    lines.push(`mesh_machine_vram_percent${labels(base)} ${num(met.vram, 0)}`);
    lines.push(`mesh_machine_disk_percent${labels(base)} ${num(met.disk, 0)}`);
    lines.push(
      `mesh_machine_network_percent${labels(base)} ${num(met.network, 0)}`,
    );
    lines.push(
      `mesh_machine_temp_cpu_celsius${labels(base)} ${num(met.tempCpu, 0)}`,
    );
    lines.push(
      `mesh_machine_temp_gpu_celsius${labels(base)} ${num(met.tempGpu, 0)}`,
    );
    lines.push(
      `mesh_machine_throttling${labels(base)} ${met.throttling ? 1 : 0}`,
    );

    const ramGb = num(hw.ramGb, 0) || num(env.memory?.totalGb, 0) || 0;
    const vramGb = num(hw.vramGb, 0) || num(env.gpu?.vramMb, 0) / 1024 || 0;
    const diskTb = num(hw.diskTb, 0) || num(env.disk?.totalTb, 0) || 0;

    lines.push(`mesh_machine_ram_total_gb${labels(base)} ${ramGb}`);
    lines.push(`mesh_machine_vram_total_gb${labels(base)} ${vramGb}`);
    lines.push(`mesh_machine_disk_total_tb${labels(base)} ${diskTb}`);

    const tools = env.tools || {};
    for (const [tool, present] of Object.entries(tools)) {
      lines.push(
        `mesh_machine_tool${labels({ ...base, tool })} ${toolPresent(present)}`,
      );
    }
  }

  help("mesh_tasks", "Tasks count by state");
  const tasks = snap.tasks || [];
  const byState = {};
  for (const t of tasks) {
    const s = t.state || "unknown";
    byState[s] = (byState[s] || 0) + 1;
  }
  if (Object.keys(byState).length === 0) {
    lines.push(`mesh_tasks${labels({ cluster, state: "none" })} 0`);
  } else {
    for (const [state, count] of Object.entries(byState)) {
      lines.push(`mesh_tasks${labels({ cluster, state })} ${count}`);
    }
  }

  help("mesh_tasks_total", "Total tasks in queue/system");
  lines.push(`mesh_tasks_total${labels({ cluster })} ${tasks.length}`);

  help("mesh_notifications", "Recent notifications buffer size");
  lines.push(
    `mesh_notifications${labels({ cluster })} ${(snap.notifications || []).length}`,
  );

  help("mesh_audit_entries", "Audit log buffer size");
  lines.push(
    `mesh_audit_entries${labels({ cluster })} ${(snap.audit || []).length}`,
  );

  help("mesh_integrations_enabled", "Enabled integrations count");
  const integ = (snap.integrations || []).filter((i) => i.enabled).length;
  lines.push(`mesh_integrations_enabled${labels({ cluster })} ${integ}`);

  const probe = store.lastProbe;
  if (probe) {
    help("mesh_local_cpu_percent", "Core host CPU load percent (last probe)");
    lines.push(
      `mesh_local_cpu_percent${labels({
        cluster,
        hostname: probe.hostname || "",
      })} ${num(probe.cpu?.usagePercent ?? probe.cpu?.loadPercent, 0)}`,
    );
    help("mesh_local_ram_percent", "Core host RAM used percent (last probe)");
    lines.push(
      `mesh_local_ram_percent${labels({
        cluster,
        hostname: probe.hostname || "",
      })} ${num(probe.memory?.usedPercent, 0)}`,
    );
    help("mesh_local_disk_percent", "Core host disk used percent (last probe)");
    lines.push(
      `mesh_local_disk_percent${labels({
        cluster,
        hostname: probe.hostname || "",
      })} ${num(probe.disk?.usedPercent, 0)}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}
