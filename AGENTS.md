# AGENTS.md — AGentHub-Grok

## Cel
Lokalny klaster 3 PC. Nie buduj SaaS. Nie domyślaj Vercel dla core.

## Priorytety
1. `packages/mesh-core` musi przechodzić `npm test` (node --test).
2. Kontrakt API zgodny z agentmesh-console client (health, snapshot, POST /v1/*, WS /v1/events).
3. Install pack Windows w `windows-install/` trzyma kopię core w `windows-install/core/`.
4. Nie commituj `cluster.env` ani `packages/mesh-core/data/`.

## Role
koordynator | obliczenia | magazyn | renderowanie | zapasowa | obserwator
(ALPHA w docs: kodowanie → mapuj na obliczenia/renderowanie w API)

## Po zmianach w core
- Zaktualizuj windows-install/core
- Odśwież ZIP release
- CHANGELOG
