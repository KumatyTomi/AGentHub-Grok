# AGentHub-Grok

**Prywatny / lokalny hub agentów AI** — 3 komputery w LAN, bez chmury jako domyślnej ścieżki.

| Stacja | Rola | IP (domyślnie) |
|--------|------|----------------|
| **ALPHA** | kodowanie · dual monitor · **Codex CLI** | `10.20.0.10` |
| **BETA** | koordynator · touch · **rdzeń :8765** | `10.20.0.20` |
| **GAMMA** | obliczenia · **Ollama** local LLM | `10.20.0.30` |

## Co jest w repo

```
local-cluster/          ← instalacja Windows (PowerShell)
  install/*.ps1
  config/cluster.env.example
  docs/KOLEJNOSC.md
  README.md
```

To **nie jest** aplikacja SaaS. Skrypty stawiają procesy na Twoich PC (Codex, Ollama, lokalny stub core).

## Szybki start

1. Sklonuj / skopiuj na pendrive.
2. `cd local-cluster/config` → skopiuj `cluster.env.example` → `cluster.env`, ustaw IP i `E:\AgentMesh`.
3. Na każdej maszynie (PowerShell **Admin**), w kolejności:

```powershell
cd local-cluster\install
Set-ExecutionPolicy -Scope Process Bypass
.\03-gamma-ollama.ps1    # najpierw model
.\02-beta-core.ps1       # potem rdzeń
.\01-alpha-codex.ps1     # potem Codex
.\00-network-check.ps1
```

Albo: `.\install-all-guide.ps1`

Szczegóły: [local-cluster/README.md](./local-cluster/README.md) · checklista: [local-cluster/docs/KOLEJNOSC.md](./local-cluster/docs/KOLEJNOSC.md)

## Air-gap

`CODEX_MODE=local` + Ollama na GAMMA → bez `codex login`, firewall tylko subnet klastra.

## Status

| Element | Stan |
|---------|------|
| Skrypty instalacyjne ALPHA/BETA/GAMMA | ✅ |
| Stub core `/v1/health` + snapshot | ✅ (Node na BETA) |
| Pełny AgentMesh-core (replikacja, PIN, invite crypto) | 🔜 |
| Panel UI (agentmesh-console) | osobne repo / podpięcie później |

## Powiązane

- [agentmesh-console](https://github.com/KumatyTomi/agentmesh-console) — panel operatorski (UI)
- Ten repo = **instalacja + hub lokalny pod Grok / Codex**

---

MIT / private use — dane zostają w LAN.
