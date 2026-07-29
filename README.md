# AGentHub-Grok

**Lokalny hub agentów AI na 3 PC** — LAN only. Bez SaaS jako domyślnej ścieżki.

[![Release](https://img.shields.io/github/v/release/KumatyTomi/AGentHub-Grok)](https://github.com/KumatyTomi/AGentHub-Grok/releases)

| Stacja | IP | Rola | Stack |
|--------|-----|------|--------|
| **ALPHA** | `10.20.0.10` | kodowanie · dual monitor | Codex CLI, git, **node-agent** |
| **BETA** | `10.20.0.20` | koordynator · touch | **mesh-core :8765** + UI + **sonda** |
| **GAMMA** | `10.20.0.30` | obliczenia | Ollama :11434, **node-agent** |

## v0.3 — sonda środowiska

- **`packages/mesh-core`** — rdzeń czyta **prawdziwy** host (CPU/RAM/IP/GPU/dysk/narzędzia)
- **GET `/v1/env`** + boot probe + skan `node.json`
- **`scripts/node-agent.mjs`** — heartbeat z sondą na ALPHA/GAMMA
- Panel pokazuje realny hardware zamiast „—”
- Testy `npm test` w `packages/mesh-core`
- Docs: [ARCHITECTURE](./docs/ARCHITECTURE.md) · [CHANGELOG](./docs/CHANGELOG.md)

## Szybki start (Windows)

1. Pobierz [release ZIP](https://github.com/KumatyTomi/AGentHub-Grok/releases)
2. `INSTALUJ.bat` jako Admin → GAMMA → BETA → ALPHA
3. Na BETA: `E:\AgentMesh\beta\start-core.cmd` → otwórz `http://127.0.0.1:8765/`
4. Na ALPHA/GAMMA: `node scripts/node-agent.mjs` (lub skrót z install pack)

### Dev (mesh-core na dowolnym PC z Node 20+)

```bash
cd packages/mesh-core
CORE_PORT=8765 CORE_HOST=127.0.0.1 MESH_NODE_ID=beta node server.mjs
# UI:  http://127.0.0.1:8765/
# ENV: http://127.0.0.1:8765/v1/env
# test: npm test
# agent (inny terminal / inna maszyna):
MESH_NODE_ID=alpha CORE_ENDPOINT=http://127.0.0.1:8765 npm run agent
```

### agentmesh-console

Panel Lovable/TS: ustaw **Local API** → `http://10.20.0.20:8765` (ten core).  
Nie używaj trybu Demo — Demo ma fikcyjne maszyny.

## Air-gap

`CODEX_MODE=local` + Ollama na GAMMA + brak `codex login` + firewall tylko subnet.

## Licencja / użycie

Private / lokalne — dane w LAN.
