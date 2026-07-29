# Architektura AGentHub-Grok 0.3

## Zasada

**Local-first.** Dane i modele zostają w LAN. Chmura jest opcją (Codex login), nie defaultem.
**Sonda środowiska** czyta REALNY host — nie hardkoduje „—”.

```
                 ┌─────────────────────────────────────┐
                 │  LAN 10.20.0.0/24  (VLAN 20 opc.)   │
                 └─────────────────────────────────────┘
        ┌────────────────┬──────────────────┬────────────────┐
        │                │                  │                │
   ALPHA .10        BETA .20            GAMMA .30
   dual + Codex     touch + mesh-core   Ollama :11434
   node-agent ────► :8765 + UI /        node-agent ────►
                    agentmesh-console
```

## Komponenty

| Komponent | Gdzie | Port | Repo path |
|-----------|-------|------|-----------|
| **mesh-core** | BETA | 8765 | `packages/mesh-core` |
| **probe** (in-process) | BETA przy starcie + tick | — | `lib/probe.js` |
| **node-agent** | ALPHA / GAMMA | — | `scripts/node-agent.mjs` |
| Operator UI (embedded) | BETA | 8765 `/` | `packages/mesh-core/public` |
| agentmesh-console (opcjonalnie) | BETA | 8080 | osobne repo |
| Codex CLI | ALPHA | — | proces systemowy |
| Ollama | GAMMA | 11434 | proces systemowy |
| Windows install pack | pendrive | — | `windows-install/` |

## Sonda środowiska

```
probeEnvironment()
  → hostname, primaryIp, addresses
  → cpu.model / cores / usage
  → memory total/used
  → disk (statfs / wmic)
  → gpu (nvidia-smi | lspci | wmic)
  → tools: node, codex, git, ollama

Boot (BETA):
  applyLocalProbe() → machines[beta].hardware + .environment
  scanNodeMarkers(MESH_ROOT) → merge node.json

ALPHA/GAMMA:
  node-agent → POST /v1/machines/heartbeat { hardware, environment, metrics }
```

| Źródło | Co widać w panelu |
|--------|-------------------|
| Boot probe na BETA | prawdziwy CPU/RAM/IP koordynatora |
| `node.json` z instalatora | IP/hostname/rola z dysku |
| node-agent heartbeat | live metryki + hardware węzła |
| Brak agentów | ALPHA/GAMMA zostają offline (świadomie) |

## Kontrakt API (zgodny z agentmesh-console)

| Method | Path | Opis |
|--------|------|------|
| GET | `/v1/health` | liveness + `environmentProbed`, `localMachineId` |
| GET | `/v1/cluster/snapshot` | pełny stan (z `machine.environment`) |
| GET | `/v1/env` | surowa sonda lokalna (świeża) |
| POST | `/v1/{command}` | mutacje |
| WS | `/v1/events` | powiadomienia live |

### Ważniejsze command paths

- `cluster/create`, `cluster/join`
- `cluster/create-invite`, `cluster/revoke-invites` (PIN)
- `pin/set`
- `machines/set-role`, `machines/set-status`, `machines/heartbeat`, `machines/quarantine` (PIN)
- `env/probe`, `env/scan-markers`
- `tasks/create`, `tasks/assign`, `tasks/progress`
- `integrations/test`

## Persystencja

- Plik: `$MESH_DATA/snapshot.json` (atomowy zapis .tmp + rename)
- PIN: SHA-256 w `_meta.pinHash` (nie w public snapshot — strip `_meta` w GET)
- Markery: `MESH_ROOT/{alpha,beta,gamma}/node.json` (odczyt przy starcie)

## Bezpieczeństwo LAN

- Firewall Windows: reguły `AgentMesh-*` tylko z subnetu klastra
- Invite JSON: 30 min, usunąć po użyciu
- Nie wystawiać `:8765` / `:11434` na WAN
- Sonda nie wysyła danych poza LAN

## Co NIE jest w 0.3

- Pełna replikacja binarna SSD / CRDT
- Szyfrowane invite z podpisanym kluczem klastra (jest fingerprint lokalny)
- Multi-user RBAC
- Auto-update
- Instant CPU % na Windows (lifetime / loadavg approximation)

To świadomie: najpierw działający lokalny hub z prawdziwym env, potem hardening.
