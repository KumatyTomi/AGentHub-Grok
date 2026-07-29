# Monitoring agentów — Prometheus + Grafana

LAN only. Core **nie** wymaga chmury. Grafana czyta metryki z mesh-core.

```text
ALPHA  ──heartbeat──┐
GAMMA  ──heartbeat──┼──► mesh-core :8765  ──/metrics──► Prometheus :9090 ──► Grafana :3000
BETA   (local probe)┘
```

## 1. Endpoint w mesh-core (już w 0.3.1)

| URL | Format | Użycie |
|-----|--------|--------|
| `GET /metrics` | Prometheus text | scrape (preferowany) |
| `GET /v1/metrics` | to samo | alias |
| `GET /v1/health` | JSON | szybki check (+ pole `metrics`) |
| `GET /v1/cluster/snapshot` | JSON | UI / Infinity (opcjonalnie) |

Sprawdzenie bez Grafany:

```bash
curl -s http://10.20.0.20:8765/metrics | head
curl -s http://10.20.0.20:8765/v1/health
```

### Główne metryki

| Metryka | Znaczenie |
|---------|-----------|
| `mesh_up` | core żyje |
| `mesh_machines_online` | ile stacji online |
| `mesh_machine_up{machine=…}` | 1 = agent/sonda online |
| `mesh_machine_heartbeat_age_seconds` | wiek lastSync; **>45 ≈ offline** |
| `mesh_machine_cpu_percent` / `_ram_percent` / `_disk_percent` | load z heartbeat/sondy |
| `mesh_machine_replica_health` | 0–100 |
| `mesh_machine_tool{tool="ollama"}` | czy narzędzie widoczne na stacji |
| `mesh_environment_probed` | boot probe OK |
| `mesh_tasks_total` | zadania w systemie |
| `mesh_local_*_percent` | host BETA (lokalna sonda) |

## 2. Start stacku (BETA lub PC z Docker)

Wymaga: Docker + Docker Compose, mesh-core już na `:8765`.

```powershell
cd E:\AgentMesh\repo\monitoring   # lub sklonowane AGentHub-Grok\monitoring
# Windows: host.docker.internal → core na hoście
docker compose up -d
```

| Serwis | URL | Login |
|--------|-----|--------|
| Grafana | http://BETA:3000 lub http://localhost:3000 | `admin` / `agentmesh` |
| Prometheus | http://localhost:9090 | — |

Dashboard auto-provisioned: **AgentMesh → AgentMesh — stan agentów**.

### Target scrape

Domyślnie `prometheus.yml`:

```yaml
targets:
  - host.docker.internal:8765
```

Na czystym Linuxie w LAN ustaw IP BETA:

```yaml
targets:
  - 10.20.0.20:8765
```

Po zmianie:

```bash
docker compose exec prometheus wget -qO- --post-data='' http://localhost:9090/-/reload
# lub: docker compose restart prometheus
```

W UI Prometheus: **Status → Targets** → `mesh-core` = UP.

## 3. Bez Dockera (Prometheus portable / Grafana Windows)

1. Pobierz [Prometheus](https://prometheus.io/download/) zip, `prometheus.yml` z tego repo.
2. Target: `10.20.0.20:8765`, `metrics_path: /metrics`.
3. Grafana OSS installer → Add data source Prometheus → `http://localhost:9090`.
4. Import: `monitoring/grafana/dashboards/agentmesh-cluster.json`.

## 4. Alerty (propozycja)

W Grafana → Alerting (lub Prometheus rules):

| Warunek | Severity | Znaczenie |
|---------|----------|-----------|
| `mesh_up == 0` (for 1m) | critical | core padł |
| `mesh_machine_up{machine="alpha"} == 0` (for 2m) | warning | brak node-agent |
| `mesh_machine_heartbeat_age_seconds > 45` | warning | stale |
| `mesh_machine_cpu_percent > 95` (for 5m) | warning | throttle |
| `mesh_environment_probed == 0` | critical | sonda nie zadziałała |
| `mesh_machine_tool{machine="gamma",tool="ollama"} == 0` | warning | brak Ollamy |

## 5. Bezpieczeństwo LAN

- Nie wystawiaj `:3000` / `:9090` / `:8765` poza subnet (firewall).
- Zmień hasło Grafany po pierwszym logowaniu (`admin` / `agentmesh` to default dev).
- `/metrics` jest **publiczne w LAN** (jak health) — nie trzyma PIN; nie loguje sekretów.

## 6. Troubleshooting

| Objaw | Co sprawdzić |
|-------|----------------|
| Target DOWN | core na 8765? `curl /metrics` z hosta Dockera |
| Wszystkie online=0 | node-agent na ALPHA/GAMMA, `start-agent.cmd` |
| CPU zawsze 0 | heartbeat bez `metrics` — zaktualizuj node-agent 0.3+ |
| Pusty dashboard | datasource UID `prometheus`, refresh 10s, time range 1h |
| host.docker.internal | Windows/Mac OK; Linux: `extra_hosts` w compose już dodane |

## 7. Pliki w repo

```text
monitoring/
  docker-compose.yml
  prometheus/prometheus.yml
  grafana/provisioning/...
  grafana/dashboards/agentmesh-cluster.json
packages/mesh-core/lib/metrics.js
packages/mesh-core/server.mjs   → GET /metrics
```
