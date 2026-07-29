@echo off
set CORE_PORT=8765
set CLUSTER_NAME=MESH-LOCAL-01
set MESH_DATA=%~dp0data
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Brak Node.js w PATH. Zainstaluj Node 22 LTS albo uruchom 02-beta-core.ps1
  pause
  exit /b 1
)
echo Starting local core on port %CORE_PORT% ...
node server.mjs
