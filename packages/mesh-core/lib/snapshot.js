/** Default cluster snapshot matching agentmesh-console ClusterSnapshot contract. */

export function nowIso() {
  return new Date().toISOString();
}

export function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyMetrics() {
  return {
    cpu: 12,
    ram: 28,
    vram: 0,
    disk: 18,
    network: 5,
    tempCpu: 48,
    tempGpu: 0,
    throttling: false,
  };
}

/**
 * @param {object} opts
 */
export function createDefaultSnapshot(opts = {}) {
  const {
    clusterName = "MESH-LOCAL-01",
    endpoint = "http://127.0.0.1:8765",
    ssdPath = "E:\\AgentMesh",
    alphaIp = "10.20.0.10",
    betaIp = "10.20.0.20",
    gammaIp = "10.20.0.30",
  } = opts;

  const t = nowIso();

  return {
    config: {
      clusterName,
      endpoint,
      mode: "local",
      ssdPath,
      pinSet: false,
      requirePinForSensitive: true,
      onboarded: false,
    },
    machines: [
      {
        id: "alpha",
        name: "ALPHA",
        host: alphaIp,
        os: "Windows 11",
        status: "offline",
        role: "obliczenia",
        roleAuto: false,
        replicaHealth: 0,
        activeTasks: 0,
        lastSync: t,
        ssdPath: `${ssdPath}\\alpha`,
        integrity: "w toku",
        metrics: emptyMetrics(),
        hardware: {
          cpu: "—",
          gpu: "—",
          ramGb: 64,
          vramGb: 12,
          diskTb: 2,
        },
        services: ["codex-cli", "git", "agentmesh-node"],
        labels: { monitors: 2, touch: false },
      },
      {
        id: "beta",
        name: "BETA",
        host: betaIp,
        os: "Windows 11",
        status: "online",
        role: "koordynator",
        roleAuto: false,
        replicaHealth: 100,
        activeTasks: 0,
        lastSync: t,
        ssdPath,
        integrity: "zweryfikowana",
        metrics: { ...emptyMetrics(), cpu: 22, ram: 35 },
        hardware: {
          cpu: "—",
          gpu: "iGPU",
          ramGb: 32,
          vramGb: 0,
          diskTb: 2,
        },
        services: ["mesh-core", "operator-ui"],
        labels: { monitors: 1, touch: true },
      },
      {
        id: "gamma",
        name: "GAMMA",
        host: gammaIp,
        os: "Windows 11 / Linux",
        status: "offline",
        role: "obliczenia",
        roleAuto: true,
        replicaHealth: 0,
        activeTasks: 0,
        lastSync: t,
        ssdPath: `${ssdPath}\\gamma`,
        integrity: "w toku",
        metrics: emptyMetrics(),
        hardware: {
          cpu: "—",
          gpu: "—",
          ramGb: 64,
          vramGb: 16,
          diskTb: 2,
        },
        services: ["ollama", "agentmesh-node"],
        labels: { monitors: 1, touch: false },
      },
    ],
    tasks: [],
    projects: [],
    integrations: [
      {
        id: "ollama-gamma",
        name: "Ollama GAMMA",
        kind: "ai-adapter",
        enabled: true,
        baseUrl: `http://${gammaIp}:11434/v1`,
        model: "llama3.2",
        keyStored: false,
        scopes: ["chat", "embeddings"],
        lastTest: null,
        description: "Lokalny LLM w LAN — air-gap friendly",
      },
      {
        id: "codex-alpha",
        name: "Codex CLI ALPHA",
        kind: "wtyczka",
        enabled: true,
        command: "codex",
        keyStored: false,
        scopes: ["workspace", "shell"],
        lastTest: null,
        description: "Proces lokalny na stacji kodowania (nie chmura)",
      },
    ],
    audit: [
      {
        id: uid("a"),
        at: t,
        actor: "system",
        action: "core/boot",
        severity: "info",
        detail: "mesh-core 0.2.0 start — tryb local-only",
      },
    ],
    trash: [],
    keys: [
      {
        id: uid("k"),
        label: "klucz-klastra",
        fingerprint: "local-" + Math.random().toString(16).slice(2, 10),
        createdAt: t,
        rotatesInDays: 90,
      },
    ],
    notifications: [],
    // internal (stripped or kept — UI ignores unknown)
    _meta: {
      version: "0.2.0",
      invites: [],
      pinHash: null,
    },
  };
}

export function publicSnapshot(snap) {
  const { _meta, ...rest } = snap;
  return rest;
}
