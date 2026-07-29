# AgentMesh LOCAL — instalacja na 3 komputerach

**Cel:** wszystko u Ciebie w LAN. Zero SaaS.  
**Nie jest to** webowa apka w chmurze — to skrypty Windows, które stawiają procesy na dysku.

| Stacja | IP (domyślnie) | Rola | Co instaluje |
|--------|----------------|------|----------------|
| **ALPHA** | `10.20.0.10` | kodowanie · 2 monitory | Git, Node, **Codex CLI**, workspace |
| **BETA** | `10.20.0.20` | koordynator · touch | **Rdzeń :8765** (stub Node), firewall, panel |
| **GAMMA** | `10.20.0.30` | obliczenia · LLM | **Ollama :11434**, model lokalny |

```
ALPHA  Codex CLI  ──LAN──►  GAMMA Ollama (model)
   │                           ▲
   └──────── LAN ──► BETA core :8765 + UI touch
```

---

## Wymagania

- 3× Windows 10/11 64-bit (Linux: Ollama/Codex da się ręcznie; skrypty są pod Windows)
- Ten sam switch / sieć `10.20.0.0/24` (lub zmień w config)
- PowerShell **jako Administrator**
- Zalecany osobny SSD `E:\AgentMesh` (magazyn klastra)
- Internet **tylko do pobrania** instalatorów (Codex/Ollama/Node). Potem można odciąć (air-gap) przy `CODEX_MODE=local`

---

## Szybki start

### 1. Skopiuj folder na pendrive / share

```
local-cluster/
  config/cluster.env.example
  install/*.ps1
  README.md
```

### 2. Config

```powershell
cd local-cluster\config
copy cluster.env.example cluster.env
notepad cluster.env
```

Ustaw IP, `MESH_ROOT`, model Ollamy.

### 3. Kolejność instalacji

1. **Sieć** — statyczne IP na każdej maszynie (skrypt podpowiada komendy).
2. **GAMMA** — najpierw model (ALPHA będzie z niego korzystać).
3. **BETA** — rdzeń API.
4. **ALPHA** — Codex wskazujący na Ollamę.
5. **Test** — `00-network-check.ps1` z dowolnego PC.

```powershell
cd local-cluster\install
Set-ExecutionPolicy -Scope Process Bypass

# interaktywny wybór stacji:
.\install-all-guide.ps1

# albo wprost:
.\03-gamma-ollama.ps1
.\02-beta-core.ps1
.\01-alpha-codex.ps1
.\00-network-check.ps1
```

---

## Po instalacji — uruchamianie

| Stacja | Komenda |
|--------|---------|
| GAMMA | `E:\AgentMesh\gamma\start-ollama.cmd` |
| BETA | `E:\AgentMesh\beta\start-core.cmd` |
| ALPHA | `E:\AgentMesh\alpha\start-codex.cmd` |

### Testy

```powershell
# z ALPHA lub BETA:
curl http://10.20.0.20:8765/v1/health
curl http://10.20.0.30:11434/api/tags

# Codex (ALPHA), model lokalny:
cd E:\AgentMesh\alpha\workspace
codex --oss --local-provider ollama
```

### Panel UI

- Stub rdzenia: `http://10.20.0.20:8765`
- UI: postaw `agentmesh-console` na BETA (`npm run dev -- --host 0.0.0.0 --port 8080`)  
  albo wskaż `-UiSource` przy `02-beta-core.ps1`.
- Na tablecie touch: przeglądarka → `http://10.20.0.20:8080`, tryb Local API → endpoint core.

---

## Role maszyn

Ustawiane w panelu / w `node.json` na każdej stacji:

`koordynator` · `kodowanie` · `obliczenia` · `magazyn` · `renderowanie` · `obserwator`

Domyślnie skrypty zapisują:

- ALPHA → `kodowanie`
- BETA → `koordynator`
- GAMMA → `obliczenia`

---

## Air-gap (100% lokalnie)

1. `CODEX_MODE=local` w `cluster.env`
2. Ollama na GAMMA z modelem na dysku
3. **Nie** uruchamiaj `codex login`
4. Firewall: reguły `AgentMesh-*` puszczają porty **tylko** z `10.20.0.0/24`
5. Odłącz WAN na routerze / nie dawaj default route

---

## Bezpieczeństwo

- `AgentMesh-Invite*.json` — jak hasło; **usuń** po dołączeniu węzła  
- PIN operatora — w pełnym core (stub go nie egzekwuje)  
- Nie wystawiaj `:8765` / `:11434` na `0.0.0.0` bez firewalla LAN  
- Skrypty wymagają Admin tylko do firewalla, hosts, env Machine

---

## Co jest „prawdziwe”, a co stubem

| Element | Status |
|---------|--------|
| IP, hosts, firewall, katalogi | realne |
| Node, Git, Codex, Ollama | realne instalatory |
| Core HTTP `/v1/health` + snapshot | **stub Node** na BETA (do wymiany na pełny AgentMesh-core) |
| Replikacja SSD / PIN / invite crypto | dopiero w pełnym core |
| Web preview w Grok | tylko mapa — nie zastępuje tych skryptów |

---

## Troubleshooting

| Objaw | Co sprawdzić |
|-------|----------------|
| `codex` not found | nowe okno PowerShell po instalacji; PATH |
| Ollama nie z LAN | `OLLAMA_HOST=0.0.0.0:11434`, reguła firewalla, `00-network-check` |
| Core health fail | `start-core.cmd`, port 8765, `node` w PATH |
| Ping OK, TCP fail | Windows Firewall inbound |
| Codex bez modelu | `ollama list` na GAMMA; base URL w `~\.codex\config.toml` |

---

## Pliki

```
local-cluster/
├── README.md                 ← ten plik
├── config/
│   └── cluster.env.example
└── install/
    ├── common.ps1
    ├── install-all-guide.ps1
    ├── 00-network-check.ps1
    ├── 01-alpha-codex.ps1
    ├── 02-beta-core.ps1
    └── 03-gamma-ollama.ps1
```

Skopiuj cały katalog `local-cluster` na pendrive i odpal na każdej maszynie osobno.
