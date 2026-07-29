# Kolejność dnia instalacji (checklista)

## Dzień 0 — sprzęt
- [ ] Switch + 3 kable (nie Wi‑Fi do rdzenia/LLM jeśli da się eth)
- [ ] SSD na magazyn (BETA trzyma `E:\AgentMesh`)
- [ ] ALPHA: 2 monitory podpięte
- [ ] BETA: ekran dotykowy skalibrowany
- [ ] GAMMA: GPU ze sterownikiem (VRAM ≥ model)

## Dzień 1 — sieć
- [ ] Router/LAN: subnet `10.20.0.0/24` (lub własny w `cluster.env`)
- [ ] ALPHA `10.20.0.10`, BETA `.20`, GAMMA `.30` statycznie
- [ ] Wyłącz zbędny internet na test air-gap (opcjonalnie)
- [ ] Pendrive z folderem `local-cluster`

## Dzień 1 — software (kolejność!)
1. [ ] GAMMA: `03-gamma-ollama.ps1` → `ollama list` OK  
2. [ ] BETA: `02-beta-core.ps1` → `curl http://127.0.0.1:8765/v1/health`  
3. [ ] ALPHA: `01-alpha-codex.ps1` → `codex --oss --local-provider ollama`  
4. [ ] Dowolna: `00-network-check.ps1` — ICMP + TCP 8765 + 11434

## Dzień 2 — workflow
- [ ] ALPHA lewy monitor: Codex; prawy: git / logi
- [ ] BETA: przeglądarka kiosk → panel + Local API
- [ ] GAMMA: tylko serwuje model (nie ruszaj w trakcie jobów)
- [ ] Backup `E:\AgentMesh` na drugi dysk

## Air-gap final
- [ ] `CODEX_MODE=local`
- [ ] brak `codex login`
- [ ] firewall AgentMesh-* tylko LAN
- [ ] test: odłącz WAN, Codex nadal gada z Ollamą
