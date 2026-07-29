# Roadmap AGentHub-Grok

Stan na **2026-07-29**. Lokalny hub agentów — LAN only, bez SaaS jako default.

---

## ✅ 0.1.0 — bootstrap instalatora

- [x] Pierwszy Windows install pack (ALPHA / BETA / GAMMA)
- [x] Skrypty sieci + Ollama + Codex
- [x] Minimalny core stub HTTP

---

## ✅ 0.2.0 — mesh-core local hub

- [x] Kontrakt API jak `agentmesh-console` (health, snapshot, POST, WS)
- [x] Persystencja `snapshot.json` + PIN operatora
- [x] WebSocket `/v1/events`
- [x] Embedded UI (3 stacje, akcje, audit, zadania)
- [x] Testy `node --test`
- [x] `scripts/doctor.mjs`
- [x] Install pack Windows pod core 0.2
- [x] Docs architektury + CHANGELOG
- [x] Release ZIP v0.2.0

---

## ✅ 0.3.0 — sonda środowiska *(obecna)*

**Problem rozwiązany:** core nie czytał prawdziwego PC — pokazywał hardkod „—” / demo.

- [x] `lib/probe.js` — realny host: hostname, IP, CPU, RAM, dysk, GPU, tools
- [x] Boot probe przy starcie mesh-core (maszyna lokalna / `MESH_NODE_ID`)
- [x] Skan `node.json` z instalatora → merge do `machines[]`
- [x] `GET /v1/env` + `POST /v1/env/probe` + `POST /v1/env/scan-markers`
- [x] Heartbeat z `hardware` + `environment`
- [x] `scripts/node-agent.mjs` (ALPHA/GAMMA → core)
- [x] Stale nodes: online bez heartbeat >45s → offline
- [x] Panel: sekcja „Środowisko lokalne”, chip PROBE, realny hardware
- [x] Install scripts: `start-agent.cmd` na ALPHA/BETA
- [x] Testy probe + API (13/13)
- [x] Sync `windows-install/core` + push na GitHub

---

## ✅ 0.3.1 — Prometheus + Grafana (monitor agentów)

- [x] `GET /metrics` + `/v1/metrics` (Prometheus text, zero deps)
- [x] `lib/metrics.js` — online, heartbeat age, CPU/RAM/disk, tools, tasks
- [x] Stack `monitoring/` — docker-compose Prometheus + Grafana
- [x] Dashboard **AgentMesh — stan agentów** (auto-provision)
- [x] Docs [MONITORING.md](./MONITORING.md)
- [x] Testy metrics (14 total)

## 🔜 0.3.2 — polish agentów (następne)

- [ ] Windows Service / Task Scheduler auto-start dla `node-agent` (ALPHA/GAMMA)
- [ ] `start-agent.cmd` także na GAMMA w `03-gamma-ollama.ps1`
- [ ] Lepszy CPU % na Windows (próbka dwupunktowa, nie lifetime idle)
- [ ] Doctor: fail-fast jeśli BETA bez `environmentProbed`
- [ ] Grafana alert rules w provisioningu
- [ ] Release ZIP **v0.3.1** (pack z /metrics)

---

## 🔜 0.4 — spięcie z agentmesh-console

- [ ] Console: domyślnie **Local API** (auto-ping `/v1/health`, fallback Demo)
- [ ] Preset endpoint z `cluster.env` / QR na BETA
- [ ] Pokazywanie `machine.environment` w UI Maszyny (nie tylko demo-data)
- [ ] Przycisk „Odśwież sondę” → `POST /v1/env/probe`
- [ ] Dokumentacja: jeden flow Console + core 0.3

---

## 🔜 0.5 — bezpieczeństwo klastra

- [ ] Invite podpisywane HMAC (klucz klastra, nie sam fingerprint)
- [ ] Rotacja kluczy + audit wymuszony
- [ ] mTLS opcjonalne między węzłami (LAN)
- [ ] Hardening: nie logować PIN / ścieżek wrażliwych

---

## 🔜 0.6 — magazyn i backup

- [ ] Eksport / import snapshot na SSD (`MESH_ROOT`)
- [ ] Checkpointy zadań na dysk (nie tylko w JSON)
- [ ] Prosta replikacja plików magazynu (rsync-like / robocopy job)
- [ ] Kosz z TTL już w core (dziś częściowo w modelu UI)

---

## 🔜 0.7 — multi-OS i operacje

- [ ] Linux install scripts (bash odpowiednik `local-cluster/install`)
- [ ] macOS agent (probe + heartbeat) — opcjonalnie
- [ ] Health dashboard: latency peerów, historia offline
- [ ] Alert gdy Ollama/Codex zniknie z PATH na węźle

---

## 🧊 Później / opcjonalnie

- [ ] Tailscale / headscale **self-host** tylko w kontrolowanym LAN (nie public SaaS)
- [ ] Plugin marketplace lokalny (katalog wtyczek na SSD)
- [ ] Multi-user RBAC
- [ ] Auto-update core z podpisanego mirroru LAN

---

## ❌ Świadomie ODRZUCONE

| Temat | Dlaczego |
|-------|----------|
| Deploy core na Vercel / public SaaS | Dane mają zostać w LAN |
| Wymuszanie cloud Codex | Default = Ollama na GAMMA (`CODEX_MODE=local`) |
| Multiplayer internetowy | Poza scope hubu lokalnego |
| Zamiana panelu na tylko chmurę Lovable | Console jest opcją; core działa offline |

---

## Jak śledzić postęp

| Artefakt | Ścieżka |
|----------|--------|
| Changelog | [docs/CHANGELOG.md](./CHANGELOG.md) |
| Architektura | [docs/ARCHITECTURE.md](./ARCHITECTURE.md) |
| Core | `packages/mesh-core` |
| Install Windows | `windows-install/`, `local-cluster/install/` |
| Repo | https://github.com/KumatyTomi/AGentHub-Grok |

**Aktualna linia:** `0.3.1` (metrics/Grafana) → następny: **0.3.2** (auto-start agentów + alerty).
