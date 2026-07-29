#Requires -Version 5.1
<#
.SYNOPSIS
  ALPHA — stacja kodowania (2 monitory): Node, Git, Codex CLI, node AgentMesh.
.DESCRIPTION
  Instaluje narzędzia DEVELOPERSKIE lokalnie. Codex działa w terminalu na tym PC.
  Pełny air-gap: CODEX_MODE=local + Ollama na GAMMA.
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
Write-Mesh "=== ALPHA · instalacja stacji kodowania (lokalnie) ===" "INFO"

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

Set-StaticIpHint -Ip $AlphaIp -Gateway $Gateway
Ensure-Dir $MeshRoot
Ensure-Dir $Workspace
Ensure-Dir (Join-Path $MeshRoot "alpha\logs")

# --- Git ---
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

# --- Codex CLI ---
if (-not $SkipCodexInstall) {
  Write-Mesh "Instalacja Codex CLI (lokalny agent w terminalu)..." "INFO"
  try {
    # Oficjalny installer Windows
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

# --- Konfiguracja Codex local-first ---
$codexHome = Join-Path $env:USERPROFILE ".codex"
Ensure-Dir $codexHome
$configPath = Join-Path $codexHome "config.toml"

if ($UseCloudCodex -or $CodexMode -eq "cloud") {
  Write-Mesh "CODEX_MODE=cloud — model w internecie (wymaga codex login)." "WARN"
  @"
# AgentMesh ALPHA — cloud model (opcjonalnie)
# model = "o3"
# Po instalacji: codex login
"@ | Set-Content -Path $configPath -Encoding UTF8
} else {
  Write-Mesh "CODEX_MODE=local — model przez Ollama na GAMMA ($OllamaBase)" "OK"
  @"
# AgentMesh ALPHA — local-only via Ollama on GAMMA
# Docs: codex --oss --local-provider ollama
# Upewnij się, że GAMMA serwuje Ollamę i firewall puszcza $Subnet

[model_providers.ollama_gamma]
name = "Ollama GAMMA (LAN)"
base_url = "$OllamaBase"

# Preferencje sandbox: zapis tylko w workspace
# sandbox_mode = "workspace-write"
"@ | Set-Content -Path $configPath -Encoding UTF8
}

# Helper batch do szybkiego startu
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
Write-Mesh "Skrót startu: $startCmd" "OK"

# Node marker + hosts
Write-HostsFileEntries -AlphaIp $AlphaIp -BetaIp $BetaIp -GammaIp $GammaIp
New-MeshNodeMarker -Root (Join-Path $MeshRoot "alpha") -Role "kodowanie" -Ip $AlphaIp -Extra @{
  workspace = $Workspace
  codexMode = $CodexMode
  ollamaBase = $OllamaBase
  monitors = 2
}

# Connectivity checks
Test-LanPeer -Ip $BetaIp -Label "BETA core"
Test-LanPeer -Ip $GammaIp -Label "GAMMA ollama"

Write-Host ""
Write-Mesh "ALPHA gotowa (narzędzia)." "OK"
Write-Host @"

Następne kroki na ALPHA:
  1. Ustaw IP $AlphaIp (jeśli jeszcze nie).
  2. Otwórz nowy terminal (żeby PATH złapał codex/node/git).
  3. cd $Workspace
  4. Lokalnie z Ollamą:  codex --oss --local-provider ollama
     albo:               $startCmd
  5. Cloud (opcjonalnie): codex login   + CODEX_MODE=cloud
  6. Dwumonitor: terminal Codex na L, logi/git na R.

Air-gap checklist:
  - GAMMA online z Ollama
  - firewall puszcza tylko $Subnet
  - NIE uruchamiaj codex login

"@
