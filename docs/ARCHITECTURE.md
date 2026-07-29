# Architektura AGentHub-Grok 0.2

## Zasada

**Local-first.** Dane i modele zostają w LAN. Chmura jest opcją (Codex login), nie defaultem.

```
                 ┌─────────────────────────────────────┐
                 │  LAN 10.20.0.0/24  (VLAN 20 opc.)   │
                 └─────────────────────────────────────┘
        ┌────────────────┬──────────────────┬────────────────┐
        │                │                  │                │
   ALPHA .10        BETA .20            GAMMA .30
   dual + Codex     touch + mesh-core   Ollama :11434
   workspace        :8765 + UI /        local LLM
                    agentmesh-console
```

## Komponenty

| Komponent | Gdzie | Port | Repo path |
|-----------|-------|------|-----------|
| **mesh-core** | BETA | 8765 | `packages/mesh-core` |
| Operator UI (embedded) | BETA | 8765 `/` | `packages/mesh-core/public` |
| agentmesh-console (opcjonalnie) | BETA | 8080 | osobne repo |
| Codex CLI | ALPHA | — | proces systemowy |
| Ollama | GAMMA | 11434 | proces systemowy |
| Windows install pack | pendrive | — | `windows-install/` |

## Kontrakt API (zgodny z agentmesh-console)

| Method | Path | Opis |
|--------|------|------|
| GET | `/v1/health` | liveness |
| GET | `/v1/cluster/snapshot` | pełny stan |
| POST | `/v1/{command}` | mutacje |
| WS | `/v1/events` | powiadomienia live |

### Ważniejsze command paths

- `cluster/create`, `cluster/join`
- `cluster/create-invite`, `cluster/revoke-invites` (PIN)
- `pin/set`
- `machines/set-role`, `machines/set-status`, `machines/heartbeat`, `machines/quarantine` (PIN)
- `tasks/create`, `tasks/assign`, `tasks/progress`
- `integrations/test`

## Persystencja

- Plik: `$MESH_DATA/snapshot.json` (atomowy zapis .tmp + rename)
- PIN: SHA-256 w `_meta.pinHash` (nie w public snapshot — strip `_meta` w GET)

## Bezpieczeństwo LAN

- Firewall Windows: reguły `AgentMesh-*` tylko z subnetu klastra
- Invite JSON: 30 min, usunąć po użyciu
- Nie wystawiać `:8765` / `:11434` na WAN

## Co NIE jest w 0.2

- Pełna replikacja binarna SSD / CRDT
- Szyfrowane invite z podpisanym kluczem klastra (jest fingerprint lokalny)
- Multi-user RBAC
- Auto-update

To świadomie: najpierw działający lokalny hub, potem hardening.
