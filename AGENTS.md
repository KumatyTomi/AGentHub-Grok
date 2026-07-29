# AGENTS.md — AGentHub-Grok

## Cel projektu
Lokalny klaster 3 PC (ALPHA dual+Codex, BETA touch+core, GAMMA Ollama). Wszystko w LAN. Nie buduj SaaS / cloud-first.

## Priorytety
1. Skrypty w `local-cluster/install/` muszą działać na Windows 10/11 (PowerShell Admin).
2. Domyślnie air-gap friendly: modele lokalne, firewall subnet-only.
3. Core na BETA może być stubem Node, ale kontrakt REST: `GET /v1/health`, `GET /v1/cluster/snapshot`, `POST /v1/*`.
4. Nie commituj `cluster.env` (tajemnic / IP produkcyjnych) — tylko `cluster.env.example`.

## Role maszyn
koordynator | kodowanie | obliczenia | magazyn | renderowanie | obserwator

## Gdy dodajesz funkcje
- Najpierw skrypt / proces lokalny, potem ewentualnie UI.
- UI zawsze → localhost/LAN API, nigdy jako jedyne źródło prawdy.
