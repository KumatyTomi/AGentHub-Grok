# Changelog

## 0.2.0 — 2026-07-29 (sprint „2 tygodnie” skondensowany)

### mesh-core (nowe)
- Lokalny rdzeń Node **bez zależności npm**
- API zgodne z `agentmesh-console` (health, snapshot, POST commands, WebSocket events)
- PIN operatora (SHA-256), invite create/revoke
- Heartbeat maszyn, role, zadania, audit, notyfikacje
- Wbudowany panel operatorski (`http://127.0.0.1:8765/`) — Ghost-in-the-Shell cyan, local-only
- Testy `node --test`
- `scripts/doctor.mjs`

### Windows install pack
- v0.2 używa `packages/mesh-core` zamiast prostego stubu
- Ulepszone skrypty ALPHA/BETA/GAMMA
- `STATUS.bat`, lepszy `CZYTAJ-MNIE`

### Docs
- ARCHITECTURE.md, ROADMAP (wykonany), CHANGELOG

## 0.1.0 — 2026-07-29
- Pierwszy ZIP instalatora Windows
- Skrypty ALPHA/BETA/GAMMA + network check
- Minimalny core stub
