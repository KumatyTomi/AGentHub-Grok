@echo off
chcp 65001 >nul
cd /d "%~dp0"
set CORE=http://127.0.0.1:8765
if exist config\cluster.env (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "BETA_IP" config\cluster.env`) do set BIP=%%B
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "CORE_PORT" config\cluster.env`) do set CPRT=%%B
  if defined BIP if defined CPRT set CORE=http://%BIP%:%CPRT%
)
echo === STATUS mesh-core ===
echo Endpoint: %CORE%
curl -s %CORE%/v1/health
echo.
curl -s %CORE%/v1/cluster/snapshot | more
pause
