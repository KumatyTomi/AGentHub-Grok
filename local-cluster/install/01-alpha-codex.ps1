#Requires -Version 5.1
<#
.SYNOPSIS
  ALPHA — stacja kodowania: Node, Git, Codex CLI, node-agent → mesh-core.
.DESCRIPTION
  Instaluje narzędzia DEVELOPERSKIE lokalnie. Codex w terminalu.
  node-agent wysyła sondę środowiska (CPU/RAM/IP) do BETA.
.EXAMPLE
  .\01-alpha-codex.ps1 -EnvFile ..\config\cluster.env
#>
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\config\cluster.env"),
  [switch]$SkipCodexInstall,
  [switch]$UseCloudCodex
)

$Common = Join-Path $PSScriptRoot "common.ps1"
. $Common

Assert-Admin
Write-Mesh "=== ALPHA · instalacja stacji kodowania + node-agent ===" "INFO"

$envMap = Import-ClusterEnv -Path $EnvFile
$AlphaIp   = Get-EnvOr $envMap "ALPHA_IP" "10.20.0.10"
$BetaIp    = Get-EnvOr $envMap "BETA_IP" "10.20.0.20"
$GammaIp   = Get-EnvOr $envMap "GAMMA_IP" "10.20.0.30"
$Gateway   = Get-EnvOr $envMap "CLUSTER_GATEWAY" "10.20.0.1"
$Subnet    = Get-EnvOr $envMap "CLUSTER_SUBNET" "10.20.0.0/24"
$MeshRoot  = Get-EnvOr $envMap "MESH_ROOT" "E:\AgentMesh"
$Workspace = Get-EnvOr $envMap "ALPHA_WORKSPACE" "E:\AgentMesh\alpha\workspace"
$CodexMode = Get-EnvOr $envMap "CODEX_MODE" "local"
$OllamaBase = Get-EnvOr $envMap "CODEX_OLLAMA_BASE" "http://10.20.0.30:11434/v1"
$NodeMajor = [int](Get-EnvOr $envMap "NODE_MAJOR" "22")
$CorePort  = [int](Get-EnvOr $envMap "CORE_PORT" "8765")

Set-StaticIpHint -Ip $AlphaIp -Gateway $Gateway
Ensure-Dir $MeshRoot
Ensure-Dir $Workspace
Ensure-Dir (Join-Path $MeshRoot "alpha\logs")
Ensure-Dir (Join-Path $MeshRoot "alpha\agent")

if (-not (Test-CommandExists "git")) {
  if (Install-WingetIfNeeded) {
    winget install Git.Git --accept-package-agreements --accept-source-agreements
  } else {
    Write-Mesh "Zainstaluj Git ręcznie: https://git-scm.com/" "ERR"
  }
} else {
  Write-Mesh "Git: $(git --version)" "OK"
}

Install-NodeLts -Major $NodeMajor

if (-not $SkipCodexInstall) {
  Write-Mesh "Instalacja Codex CLI..." "INFO"
  try {
    $installPs1 = Join-Path $env:TEMP "codex-install.ps1"
    Invoke-WebRequest -Uri "https://chatgpt.com/codex/install.ps1" -OutFile $installPs1 -UseBasicParsing
    & powershell -ExecutionPolicy Bypass -File $installPs1
    Write-Mesh "Installer Codex uruchomiony." "OK"
  } catch {
    Write-Mesh "Installer HTTP nieudany — próbuję npm @openai/codex" "WARN"
    if (Test-CommandExists "npm") {
      npm install -g @openai/codex
    } else {
      Write-Mesh "Brak npm — zainstaluj Codex ręcznie po restarcie shella." "ERR"
    }
  }
} else {
  Write-Mesh "Pominięto instalację Codex (-SkipCodexInstall)" "WARN"
}

$codexHome = Join-Path $env:USERPROFILE ".codex"
Ensure-Dir $codexHome
$configPath = Join-Path $codexHome "config.toml"

if ($UseCloudCodex -or $CodexMode -eq "cloud") {
  Write-Mesh "CODEX_MODE=cloud — model w internecie (wymaga codex login)." "WARN"
  @"
# AgentMesh ALPHA — cloud model (opcjonalnie)
# Po instalacji: codex login
"@ | Set-Content -Path $configPath -Encoding UTF8
} else {
  Write-Mesh "CODEX_MODE=local — model przez Ollama na GAMMA ($OllamaBase)" "OK"
  @"
# AgentMesh ALPHA — local-only via Ollama on GAMMA
[model_providers.ollama_gamma]
name = "Ollama GAMMA (LAN)"
base_url = "$OllamaBase"
"@ | Set-Content -Path $configPath -Encoding UTF8
}

$startCmd = Join-Path $MeshRoot "alpha\start-codex.cmd"
@"
@echo off
cd /d "$Workspace"
echo === AgentMesh ALPHA · Codex local ===
echo Workspace: %CD%
echo Ollama (GAMMA): $OllamaBase
echo.
if /I "$CodexMode"=="local" (
  codex --oss --local-provider ollama
) else (
  codex
)
pause
"@ | Set-Content -Path $startCmd -Encoding ASCII
Write-Mesh "Skrót Codex: $startCmd" "OK"

# Copy node-agent from mesh-core pack if present
$agentSrcCandidates = @(
  (Join-Path $PSScriptRoot "..\core\scripts\node-agent.mjs"),
  (Join-Path $PSScriptRoot "..\..\packages\mesh-core\scripts\node-agent.mjs"),
  (Join-Path $PSScriptRoot "..\packages\mesh-core\scripts\node-agent.mjs")
)
$agentLibCandidates = @(
  (Join-Path $PSScriptRoot "..\core\lib"),
  (Join-Path $PSScriptRoot "..\..\packages\mesh-core\lib"),
  (Join-Path $PSScriptRoot "..\packages\mesh-core\lib")
)
$agentDest = Join-Path $MeshRoot "alpha\agent"
$copied = $false
for ($i = 0; $i -lt $agentSrcCandidates.Count; $i++) {
  $src = $agentSrcCandidates[$i]
  $lib = $agentLibCandidates[$i]
  if ((Test-Path $src) -and (Test-Path $lib)) {
    Ensure-Dir (Join-Path $agentDest "scripts")
    Ensure-Dir (Join-Path $agentDest "lib")
    Copy-Item $src (Join-Path $agentDest "scripts\node-agent.mjs") -Force
    Copy-Item (Join-Path $lib "*") (Join-Path $agentDest "lib") -Recurse -Force
    $copied = $true
    Write-Mesh "Skopiowano node-agent → $agentDest" "OK"
    break
  }
}
if (-not $copied) {
  Write-Mesh "Brak node-agent w packu — skopiuj packages/mesh-core/scripts + lib ręcznie." "WARN"
}

$startAgent = Join-Path $MeshRoot "alpha\start-agent.cmd"
@"
@echo off
set CORE_ENDPOINT=http://${BetaIp}:$CorePort
set MESH_NODE_ID=alpha
set MESH_ROLE=kodowanie
set MESH_ROOT=$MeshRoot
set HEARTBEAT_MS=5000
cd /d "$agentDest"
echo === node-agent ALPHA → %CORE_ENDPOINT% ===
echo Wysyła prawdziwe CPU/RAM/IP do mesh-core (sonda środowiska)
node scripts\node-agent.mjs
"@ | Set-Content -Path $startAgent -Encoding ASCII
Write-Mesh "Skrót agent: $startAgent" "OK"

Write-HostsFileEntries -AlphaIp $AlphaIp -BetaIp $BetaIp -GammaIp $GammaIp
New-MeshNodeMarker -Root (Join-Path $MeshRoot "alpha") -Role "kodowanie" -Ip $AlphaIp -Extra @{
  workspace = $Workspace
  codexMode = $CodexMode
  ollamaBase = $OllamaBase
  monitors = 2
  agent = $true
}

Test-LanPeer -Ip $BetaIp -Label "BETA core"
Test-LanPeer -Ip $GammaIp -Label "GAMMA ollama"

Write-Host ""
Write-Mesh "ALPHA gotowa." "OK"
Write-Host @"

Następne kroki na ALPHA:
  1. Ustaw IP $AlphaIp
  2. Nowe okno PowerShell (PATH)
  3. Start agent (żeby core WIDZIAŁ to PC):  $startAgent
  4. Codex:  $startCmd
     lub:    cd $Workspace && codex --oss --local-provider ollama

Bez node-agent BETA nie zobaczy prawdziwego sprzętu ALPHA.

"@
