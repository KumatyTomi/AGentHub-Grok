# AGentHub-Grok

**Lokalny hub agentów AI na 3 PC** — LAN only. Bez SaaS jako domyślnej ścieżki.

[![Release](https://img.shields.io/github/v/release/KumatyTomi/AGentHub-Grok)](https://github.com/KumatyTomi/AGentHub-Grok/releases)

| Stacja | IP | Rola | Stack |
|--------|-----|------|--------|
| **ALPHA** | `10.20.0.10` | kodowanie · dual monitor | Codex CLI, git, node |
| **BETA** | `10.20.0.20` | koordynator · touch | **mesh-core :8765** + UI |
| **GAMMA** | `10.20.0.30` | obliczenia | Ollama :11434 |

## v0.2 — co jest w środku

- **`packages/mesh-core`** — lokalny rdzeń (REST + WebSocket + panel HTML), zgodny z [agentmesh-console](https://github.com/KumatyTomi/agentmesh-console)
- **Windows install pack** — `windows-install/` + release ZIP
- **Testy** — `cd packages/mesh-core && npm test`
- **Docs** — [ARCHITECTURE](./docs/ARCHITECTURE.md) · [ROADMAP](./docs/ROADMAP.md) · [CHANGELOG](./docs/CHANGELOG.md)

## Szybki start (Windows)

1. Pobierz [release ZIP](https://github.com/KumatyTomi/AGentHub-Grok/releases)
2. `INSTALUJ.bat` jako Admin → GAMMA → BETA → ALPHA
3. Na BETA: `E:\AgentMesh\beta\start-core.cmd` → otwórz `http://127.0.0.1:8765/`

### Dev (mesh-core na dowolnym PC z Node 20+)

```bash
cd packages/mesh-core
CORE_PORT=8765 CORE_HOST=127.0.0.1 node server.mjs
# UI: http://127.0.0.1:8765/
# test: npm test
```

### agentmesh-console

Panel Lovable/TS: ustaw **Local API** → `http://10.20.0.20:8765` (ten core).

## Air-gap

`CODEX_MODE=local` + Ollama na GAMMA + brak `codex login` + firewall tylko subnet.

## Licencja / użycie

Private / lokalne — dane w LAN.
