import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createDefaultSnapshot, nowIso, publicSnapshot, uid } from "./snapshot.js";

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

  /**
   * Route mutating commands: path like "cluster/create" or "machines/set-role"
   */
  command(path, body = {}) {
    const p = String(path || "").replace(/^\/+/, "");
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
        const m = this.snap.machines.find((x) => x.id === body.id);
        if (!m) return { ok: false, error: "Nie znaleziono maszyny", status: 404 };
        m.status = "online";
        m.lastSync = nowIso();
        if (body.metrics) m.metrics = { ...m.metrics, ...body.metrics };
        if (body.hardware) m.hardware = { ...m.hardware, ...body.hardware };
        m.replicaHealth = body.replicaHealth ?? Math.min(100, (m.replicaHealth || 0) + 10);
        if (m.replicaHealth >= 100) m.integrity = "zweryfikowana";
        this.save();
        return { ok: true, data: { accepted: true, path: p } };
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

  /** Soft tick: age tasks, jitter metrics on online machines */
  tick() {
    for (const m of this.snap.machines) {
      if (m.status !== "online") continue;
      const j = () => Math.max(3, Math.min(98, (m.metrics.cpu || 10) + (Math.random() * 6 - 3)));
      m.metrics.cpu = Math.round(j());
      m.metrics.ram = Math.max(
        8,
        Math.min(95, (m.metrics.ram || 20) + (Math.random() * 4 - 2)),
      );
      m.metrics.network = Math.max(1, Math.min(90, (m.metrics.network || 5) + (Math.random() * 8 - 4)));
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
