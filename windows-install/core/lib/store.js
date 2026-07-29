import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createDefaultSnapshot, nowIso, publicSnapshot, uid } from "./snapshot.js";
import {
  probeEnvironment,
  envToMachinePatch,
  scanNodeMarkers,
  resolveLocalMachineId,
} from "./probe.js";

export class MeshStore {
  /**
   * @param {string} dataDir
   * @param {object} bootOpts
   */
  constructor(dataDir, bootOpts = {}) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, "snapshot.json");
    this.bootOpts = bootOpts;
    this.listeners = new Set();
    this.snap = this.load();
    this.lastProbe = null;
  }

  load() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (fs.existsSync(this.file)) {
      try {
        return JSON.parse(fs.readFileSync(this.file, "utf8"));
      } catch {
        /* fallthrough */
      }
    }
    const snap = createDefaultSnapshot(this.bootOpts);
    this.persist(snap);
    return snap;
  }

  persist(snap = this.snap) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(snap, null, 2));
    fs.renameSync(tmp, this.file);
  }

  getPublic() {
    return publicSnapshot(this.snap);
  }

  audit(actor, action, detail, severity = "info") {
    this.snap.audit = this.snap.audit || [];
    this.snap.audit.unshift({
      id: uid("a"),
      at: nowIso(),
      actor,
      action,
      severity,
      detail: String(detail ?? "").slice(0, 400),
    });
    this.snap.audit = this.snap.audit.slice(0, 200);
  }

  notify(title, detail, level = "info") {
    const n = {
      id: uid("n"),
      at: nowIso(),
      title,
      detail,
      level,
    };
    this.snap.notifications = this.snap.notifications || [];
    this.snap.notifications.unshift(n);
    this.snap.notifications = this.snap.notifications.slice(0, 50);
    for (const fn of this.listeners) {
      try {
        fn(n);
      } catch {
        /* ignore */
      }
    }
    return n;
  }

  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  save() {
    this.persist();
  }

  hashPin(pin) {
    return crypto.createHash("sha256").update(String(pin)).digest("hex");
  }

  setPin(pin) {
    if (!/^\d{6}$/.test(String(pin))) {
      return { ok: false, error: "PIN musi mieć 6 cyfr" };
    }
    this.snap._meta = this.snap._meta || {};
    this.snap._meta.pinHash = this.hashPin(pin);
    this.snap.config.pinSet = true;
    this.audit("operator", "pin/set", "PIN operatora ustawiony", "ostrzeżenie");
    this.save();
    return { ok: true };
  }

  checkPin(pin) {
    if (!this.snap.config.requirePinForSensitive) return true;
    if (!this.snap.config.pinSet) return true;
    const h = this.snap._meta?.pinHash;
    if (!h) return true;
    return h === this.hashPin(pin);
  }

  applyLocalProbe(opts = {}) {
    const meshRoot =
      opts.meshRoot || this.bootOpts.ssdPath || process.env.MESH_ROOT || process.cwd();
    const env = probeEnvironment({
      meshRoot,
      nodeId: opts.nodeId || process.env.MESH_NODE_ID,
      role: opts.role || process.env.MESH_ROLE,
      light: Boolean(opts.light),
    });
    this.lastProbe = env;

    const machineId =
      opts.machineId ||
      resolveLocalMachineId(this.snap.machines, env, this.bootOpts) ||
      "beta";

    this.applyMachineEnv(machineId, env, {
      role: opts.role,
      markOnline: true,
      replicaHealth: 100,
    });

    this.snap._meta = this.snap._meta || {};
    this.snap._meta.lastLocalProbe = env.probedAt;
    this.snap._meta.localMachineId = machineId;
    this.snap.config.environmentProbed = true;
    this.snap.config.probedAt = env.probedAt;

    return { env, machineId };
  }

  mergeNodeMarkers(meshRoot) {
    const root = meshRoot || this.bootOpts.ssdPath || process.env.MESH_ROOT;
    const markers = scanNodeMarkers(root);
    if (!markers.length) return { merged: 0, markers: [] };

    let merged = 0;
    for (const mk of markers) {
      let id = null;
      if (/[/\\]alpha[/\\]/i.test(mk.path) || /alpha/i.test(path.basename(path.dirname(mk.path)))) {
        id = "alpha";
      } else if (/[/\\]beta[/\\]/i.test(mk.path) || /beta/i.test(path.basename(path.dirname(mk.path)))) {
        id = "beta";
      } else if (
        /[/\\]gamma[/\\]/i.test(mk.path) ||
        /gamma/i.test(path.basename(path.dirname(mk.path)))
      ) {
        id = "gamma";
      }

      if (!id && mk.ip) {
        const hit = this.snap.machines.find((m) => m.host === mk.ip);
        if (hit) id = hit.id;
      }

      if (!id) {
        id = uid("node");
        this.snap.machines.push({
          id,
          name: mk.hostname || id.toUpperCase(),
          host: mk.ip || "0.0.0.0",
          os: mk.os || "unknown",
          status: "offline",
          role: mk.role || "obserwator",
          roleAuto: true,
          replicaHealth: 0,
          activeTasks: 0,
          lastSync: mk.installedAt || nowIso(),
          ssdPath: root,
          integrity: "w toku",
          metrics: {
            cpu: 0,
            ram: 0,
            vram: 0,
            disk: 0,
            network: 0,
            tempCpu: 0,
            tempGpu: 0,
            throttling: false,
          },
          hardware: { cpu: "—", gpu: "—", ramGb: 0, vramGb: 0, diskTb: 0 },
          environment: null,
          marker: mk,
        });
        merged++;
        continue;
      }

      const m = this.snap.machines.find((x) => x.id === id);
      if (!m) continue;
      if (mk.ip) m.host = mk.ip;
      if (mk.os) m.os = mk.os;
      m.marker = mk;
      merged++;
    }

    this.snap._meta = this.snap._meta || {};
    this.snap._meta.nodeMarkers = markers;
    this.audit("probe", "env/scan-markers", `${merged} marker(s) z ${root}`, "info");
    this.save();
    return { merged, markers };
  }

  applyMachineEnv(machineId, envOrPatch, opts = {}) {
    let m = this.snap.machines.find((x) => x.id === machineId || x.name === machineId);
    if (!m && opts.create) {
      m = {
        id: machineId,
        name: String(machineId).toUpperCase(),
        host: "0.0.0.0",
        os: "unknown",
        status: "offline",
        role: opts.role || "obserwator",
        roleAuto: true,
        replicaHealth: 0,
        activeTasks: 0,
        lastSync: nowIso(),
        ssdPath: this.bootOpts.ssdPath || "",
        integrity: "w toku",
        metrics: {
          cpu: 0,
          ram: 0,
          vram: 0,
          disk: 0,
          network: 0,
          tempCpu: 0,
          tempGpu: 0,
          throttling: false,
        },
        hardware: { cpu: "—", gpu: "—", ramGb: 0, vramGb: 0, diskTb: 0 },
      };
      this.snap.machines.push(m);
    }
    if (!m) return null;

    const isFullEnv = envOrPatch && envOrPatch.cpu && envOrPatch.memory && envOrPatch.probedAt;
    const patch = isFullEnv ? envToMachinePatch(envOrPatch) : envOrPatch || {};

    if (patch.host) m.host = patch.host;
    if (patch.os) m.os = patch.os;
    if (patch.metrics) {
      m.metrics = { ...m.metrics, ...Object.fromEntries(
        Object.entries(patch.metrics).filter(([, v]) => v !== undefined && v !== null),
      ) };
    }
    if (patch.hardware) {
      m.hardware = {
        ...m.hardware,
        ...Object.fromEntries(
          Object.entries(patch.hardware).filter(([, v]) => v !== undefined && v !== null && v !== "—"),
        ),
      };
      // still allow explicit "—" only if nothing known yet
      for (const [k, v] of Object.entries(patch.hardware || {})) {
        if ((m.hardware[k] === undefined || m.hardware[k] === "—" || m.hardware[k] === 0) && v) {
          m.hardware[k] = v;
        }
      }
    }
    if (patch.environment) {
      m.environment = { ...(m.environment || {}), ...patch.environment };
    } else if (isFullEnv) {
      m.environment = envToMachinePatch(envOrPatch).environment;
    }

    if (opts.markOnline !== false) {
      m.status = opts.status || "online";
      m.lastSync = nowIso();
    }
    if (opts.replicaHealth != null) {
      m.replicaHealth = Math.max(0, Math.min(100, Number(opts.replicaHealth)));
      if (m.replicaHealth >= 100) m.integrity = "zweryfikowana";
    }
    if (opts.role) m.role = opts.role;

    return m;
  }

  command(cmdPath, body = {}) {
    const p = String(cmdPath || "").replace(/^\/+/, "");
    const actor = body.actor || "operator";

    const sensitive = [
      "cluster/create",
      "machines/remove",
      "machines/quarantine",
      "keys/rotate",
      "trash/purge",
      "cluster/revoke-invites",
    ];
    if (sensitive.some((s) => p.startsWith(s) || p === s)) {
      if (!this.checkPin(body.pin)) {
        this.audit(actor, p, "Odrzucono — zły PIN", "alarm");
        this.save();
        return { ok: false, error: "Wymagany poprawny PIN operatora", status: 403 };
      }
    }

    switch (p) {
      case "cluster/create": {
        if (body.clusterName) this.snap.config.clusterName = String(body.clusterName).trim();
        if (body.ssd) this.snap.config.ssdPath = String(body.ssd).trim();
        this.snap.config.onboarded = true;
        if (body.pin) this.setPin(body.pin);
        this.audit(actor, p, `Klaster ${this.snap.config.clusterName}`, "info");
        this.notify("Klaster utworzony", this.snap.config.clusterName, "info");
        this.save();
        return { ok: true, data: { accepted: true, path: p } };
      }
      case "cluster/join": {
        this.snap.config.onboarded = true;
        this.audit(actor, p, body.invite || "join", "info");
        this.notify("Maszyna dołączyła", String(body.invite || "invite"), "info");
        this.save();
        return { ok: true, data: { accepted: true, path: p } };
      }
      case "cluster/create-invite": {
        const inv = {
          id: uid("inv"),
          clusterName: this.snap.config.clusterName,
          coreEndpoint: this.snap.config.endpoint,
          issuedAt: nowIso(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          fingerprint: this.snap.keys[0]?.fingerprint || "local",
          used: false,
        };
        this.snap._meta = this.snap._meta || {};
        this.snap._meta.invites = this.snap._meta.invites || [];
        this.snap._meta.invites.unshift(inv);
        this.snap._meta.invites = this.snap._meta.invites.slice(0, 20);
        this.audit(actor, p, inv.id, "ostrzeżenie");
        this.notify("Zaproszenie wygenerowane", "Ważne 30 minut — usuń po użyciu", "ostrzeżenie");
        this.save();
        return { ok: true, data: { accepted: true, path: p, invite: inv } };
      }
      case "cluster/revoke-invites": {
        if (this.snap._meta) this.snap._meta.invites = [];
        this.audit(actor, p, "wszystkie unieważnione", "alarm");
        this.notify("Zaproszenia unieważnione", "Aktywne invite wyczyszczone", "alarm");
        this.save();
        return { ok: true, data: { accepted: true, path: p } };
      }
      case "pin/set": {
        const r = this.setPin(body.pin);
        return r.ok
          ? { ok: true, data: { accepted: true, path: p } }
          : { ok: false, error: r.error, status: 400 };
      }
      case "machines/set-role": {
        const m = this.snap.machines.find((x) => x.id === body.id || x.name === body.name);
        if (!m) return { ok: false, error: "Nie znaleziono maszyny", status: 404 };
        m.role = body.role || m.role;
        m.roleAuto = Boolean(body.roleAuto);
        this.audit(actor, p, `${m.name} → ${m.role}`, "info");
        this.save();
        return { ok: true, data: { accepted: true, path: p, machine: m } };
      }
      case "machines/set-status": {
        const m = this.snap.machines.find((x) => x.id === body.id);
        if (!m) return { ok: false, error: "Nie znaleziono maszyny", status: 404 };
        m.status = body.status || m.status;
        m.lastSync = nowIso();
        this.audit(actor, p, `${m.name} ${m.status}`, "info");
        this.notify("Status maszyny", `${m.name}: ${m.status}`, "info");
        this.save();
        return { ok: true, data: { accepted: true, path: p } };
      }
      case "machines/heartbeat": {
        const id = body.id || body.nodeId;
        if (!id) return { ok: false, error: "Wymagane id maszyny", status: 400 };

        const m = this.applyMachineEnv(
          id,
          {
            host: body.host,
            os: body.os,
            hostname: body.hostname,
            metrics: body.metrics,
            hardware: body.hardware,
            environment: body.environment || null,
          },
          {
            create: Boolean(body.create),
            markOnline: true,
            replicaHealth: body.replicaHealth ?? 100,
            role: body.role,
            status: "online",
          },
        );

        if (!m) return { ok: false, error: "Nie znaleziono maszyny", status: 404 };

        if (body.env && body.env.cpu) {
          this.applyMachineEnv(id, body.env, {
            markOnline: true,
            replicaHealth: body.replicaHealth ?? 100,
          });
        }

        if (body.hardware?.cpu && body.hardware.cpu !== "—") {
          if (m.integrity !== "niezgodność") m.integrity = "zweryfikowana";
        }

        this.save();
        return { ok: true, data: { accepted: true, path: p, machine: stripMarker(m) } };
      }
      case "machines/quarantine": {
        const m = this.snap.machines.find((x) => x.id === body.id);
        if (!m) return { ok: false, error: "Nie znaleziono maszyny", status: 404 };
        m.status = "kwarantanna";
        this.audit(actor, p, m.name, "alarm");
        this.notify("Kwarantanna", m.name, "alarm");
        this.save();
        return { ok: true, data: { accepted: true, path: p } };
      }
      case "env/probe": {
        const result = this.applyLocalProbe({
          meshRoot: body.meshRoot || this.bootOpts.ssdPath,
          machineId: body.id,
          role: body.role,
        });
        if (body.scanMarkers !== false) {
          this.mergeNodeMarkers(body.meshRoot || this.bootOpts.ssdPath || process.env.MESH_ROOT);
        }
        this.audit(actor, p, `host=${result.env.hostname} ip=${result.env.primaryIp}`, "info");
        this.notify(
          "Sonda środowiska",
          `${result.env.hostname} · ${result.env.cpu.model} · ${result.env.memory.totalGb} GB`,
          "info",
        );
        this.save();
        return {
          ok: true,
          data: {
            accepted: true,
            path: p,
            machineId: result.machineId,
            environment: result.env,
          },
        };
      }
      case "env/scan-markers": {
        const r = this.mergeNodeMarkers(
          body.meshRoot || this.bootOpts.ssdPath || process.env.MESH_ROOT,
        );
        return { ok: true, data: { accepted: true, path: p, ...r } };
      }
      case "tasks/create": {
        const task = {
          id: uid("t"),
          title: body.title || "Nowe zadanie",
          project: body.project || "lokalne",
          state: "kolejka",
          critical: Boolean(body.critical),
          priority: Number(body.priority) || 50,
          agedPriority: Number(body.priority) || 50,
          queuedAt: nowIso(),
          assignedTo: body.assignedTo || null,
          progress: 0,
          dependsOn: body.dependsOn || [],
          steps: body.steps || [
            { id: "s1", label: "Przygotowanie", done: false, minutes: 5 },
            { id: "s2", label: "Wykonanie", done: false, minutes: 20 },
            { id: "s3", label: "Weryfikacja", done: false, minutes: 5 },
          ],
          checkpoints: [],
          checkpointEveryMin: 15,
          migrations: 0,
        };
        this.snap.tasks.unshift(task);
        this.audit(actor, p, task.title, "info");
        this.notify("Zadanie w kolejce", task.title, "info");
        this.save();
        return { ok: true, data: { accepted: true, path: p, task } };
      }
      case "tasks/assign": {
        const task = this.snap.tasks.find((x) => x.id === body.id);
        if (!task) return { ok: false, error: "Brak zadania", status: 404 };
        task.assignedTo = body.assignedTo || null;
        task.state = "w toku";
        this.audit(actor, p, `${task.id} → ${task.assignedTo}`, "info");
        this.save();
        return { ok: true, data: { accepted: true, path: p, task } };
      }
      case "tasks/progress": {
        const task = this.snap.tasks.find((x) => x.id === body.id);
        if (!task) return { ok: false, error: "Brak zadania", status: 404 };
        task.progress = Math.max(0, Math.min(100, Number(body.progress) || 0));
        if (task.progress >= 100) task.state = "zakończone";
        else if (task.progress > 0) task.state = "w toku";
        this.save();
        return { ok: true, data: { accepted: true, path: p, task } };
      }
      case "integrations/test": {
        const integ = this.snap.integrations.find((x) => x.id === body.id);
        if (!integ) return { ok: false, error: "Brak integracji", status: 404 };
        integ.lastTest = {
          at: nowIso(),
          ok: true,
          latencyMs: 12 + Math.floor(Math.random() * 40),
        };
        this.audit(actor, p, integ.name, "info");
        this.save();
        return { ok: true, data: { accepted: true, path: p, lastTest: integ.lastTest } };
      }
      case "config/endpoint": {
        if (body.endpoint) this.snap.config.endpoint = String(body.endpoint);
        this.save();
        return { ok: true, data: { accepted: true, path: p } };
      }
      default: {
        this.audit(actor, p, JSON.stringify(body).slice(0, 120), "info");
        this.save();
        return { ok: true, data: { accepted: true, path: p } };
      }
    }
  }

  tick() {
    const localId = this.snap._meta?.localMachineId;

    try {
      const env = probeEnvironment({
        meshRoot: this.bootOpts.ssdPath || process.env.MESH_ROOT || process.cwd(),
        nodeId: localId,
        light: true,
      });
      this.lastProbe = { ...(this.lastProbe || {}), ...env, gpu: this.lastProbe?.gpu ?? env.gpu };
      if (localId) {
        this.applyMachineEnv(localId, env, {
          markOnline: true,
          replicaHealth: 100,
        });
      }
    } catch {
      /* ignore */
    }

    const staleMs = 45_000;
    const now = Date.now();
    for (const m of this.snap.machines) {
      if (m.id === localId) continue;
      if (m.status !== "online" && m.status !== "synchronizacja") continue;
      const last = Date.parse(m.lastSync || 0);
      if (last && now - last > staleMs) {
        m.status = "offline";
        this.notify("Utracono łączność", `${m.name} bez heartbeat >45s`, "ostrzeżenie");
      }
    }

    for (const m of this.snap.machines) {
      if (m.status !== "online") continue;
      if (!m.environment) {
        const j = () => Math.max(3, Math.min(98, (m.metrics.cpu || 10) + (Math.random() * 6 - 3)));
        m.metrics.cpu = Math.round(j());
        m.metrics.ram = Math.max(8, Math.min(95, (m.metrics.ram || 20) + (Math.random() * 4 - 2)));
        m.metrics.network = Math.max(
          1,
          Math.min(90, (m.metrics.network || 5) + (Math.random() * 8 - 4)),
        );
      }
    }
    for (const t of this.snap.tasks) {
      if (t.state === "w toku" && t.progress < 100) {
        t.progress = Math.min(100, t.progress + Math.floor(Math.random() * 3));
        if (t.progress >= 100) t.state = "zakończone";
        t.agedPriority = Math.min(100, (t.agedPriority || t.priority) + 0.1);
      }
    }
    this.save();
  }
}

function stripMarker(m) {
  if (!m) return m;
  const { marker, ...rest } = m;
  return rest;
}
