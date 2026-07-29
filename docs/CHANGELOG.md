# Changelog

## 0.3.1 — 2026-07-29 (Prometheus + Grafana)

### mesh-core
- **`GET /metrics`** i **`/v1/metrics`** — ekspozycja Prometheus (bez npm deps)
- **`lib/metrics.js`** — stan maszyn, heartbeat age, CPU/RAM/disk/VRAM, tools, tasks, local probe
- Health zwraca `metrics: "/metrics"` i wersję **0.3.1**
- Footer UI: link do `/metrics`

### monitoring/
- `docker-compose.yml` — Prometheus :9090 + Grafana :3000 (LAN)
- Dashboard **AgentMesh — stan agentów** (provisioned)
- Datasource Prometheus auto
- Docs: [MONITORING.md](./MONITORING.md)

### Testy
- 14/14 (w tym suite metrics)

## 0.3.0 — 2026-07-29 (sonda środowiska)

### mesh-core
- **`lib/probe.js`** — odczyt REALNEGO hosta: hostname, IP, CPU, RAM, dysk, GPU (nvidia-smi/lspci/wmic), narzędzia (codex/git/ollama/node)
- **Boot probe** — przy starcie aktualizuje lokalną maszynę (domyślnie BETA / `MESH_NODE_ID`) prawdziwym hardware
- **Skan `node.json`** — instalator zapisuje markery, core je czyta i scala z `machines[]`
- **GET `/v1/env`** — surowa sonda na żądanie
- **POST `/v1/env/probe`**, **`/v1/env/scan-markers`**
- **Heartbeat** przyjmuje `hardware` + `environment` (pełny payload z node-agent)
- **Stale nodes** — online bez heartbeat >45s → offline
- **`scripts/node-agent.mjs`** — lekki agent na ALPHA/GAMMA (periodiczny heartbeat z sondą)
- Panel UI: sekcja „Środowisko lokalne”, chip PROBE, prawdziwy CPU/GPU na kartach maszyn
- Testy: probe unit + API env/heartbeat/markers
- Doctor pokazuje wynik lokalnej sondy

### Docs
- ROADMAP zaktualizowany: 0.3 done, plan 0.3.1 → 0.7
- README ze skrótem roadmapy

### Windows install
- `start-agent.cmd` na ALPHA/BETA
- `windows-install/core` zsynchronizowany z 0.3

## 0.2.0 — 2026-07-29 (sprint „2 tygodnie” skondensowany)

### mesh-core (nowe)
- Lokalny rdzeń Node **bez zależności npm**
- API zgodne z `agentmesh-console` (health, snapshot, POST commands, WebSocket events)
- PIN operatora (SHA-256), invite create/revoke
- Heartbeat maszyn, role, zadania, audit, notyfikacje
- Wbudowany panel operatorski (`http://127.0.0.1:8765/`) — Ghost-in-the-Shell cyan, local-only
- Testy `node --test`
- `scripts/doctor.mjs`

### Windows install pack
- v0.2 używa `packages/mesh-core` zamiast prostego stubu
- Ulepszone skrypty ALPHA/BETA/GAMMA
- `STATUS.bat`, lepszy `CZYTAJ-MNIE`

### Docs
- ARCHITECTURE.md, ROADMAP, CHANGELOG

## 0.1.0 — 2026-07-29
- Pierwszy ZIP instalatora Windows
- Skrypty ALPHA/BETA/GAMMA + network check
- Minimalny core stub
