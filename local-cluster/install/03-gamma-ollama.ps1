#Requires -Version 5.1
<#
.SYNOPSIS
  GAMMA — local LLM (Ollama) + node AgentMesh, tylko LAN.
.EXAMPLE
  .\03-gamma-ollama.ps1 -EnvFile ..\config\cluster.env
#>
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\config\cluster.env"),
  [switch]$SkipModelPull
)

$Common = Join-Path $PSScriptRoot "common.ps1"
. $Common

Assert-Admin
Write-Mesh "=== GAMMA · Ollama local LLM ===" "INFO"

$envMap = Import-ClusterEnv -Path $EnvFile
$AlphaIp = Get-EnvOr $envMap "ALPHA_IP" "10.20.0.10"
$BetaIp  = Get-EnvOr $envMap "BETA_IP" "10.20.0.20"
$GammaIp = Get-EnvOr $envMap "GAMMA_IP" "10.20.0.30"
$Gateway = Get-EnvOr $envMap "CLUSTER_GATEWAY" "10.20.0.1"
$Subnet  = Get-EnvOr $envMap "CLUSTER_SUBNET" "10.20.0.0/24"
$MeshRoot = Get-EnvOr $envMap "MESH_ROOT" "E:\AgentMesh"
$ModelsDir = Get-EnvOr $envMap "GAMMA_MODELS" "E:\AgentMesh\gamma\ollama"
$OllamaPort = [int](Get-EnvOr $envMap "OLLAMA_PORT" "11434")
$Model = Get-EnvOr $envMap "OLLAMA_MODEL" "llama3.2"

Set-StaticIpHint -Ip $GammaIp -Gateway $Gateway
Ensure-Dir $MeshRoot
Ensure-Dir $ModelsDir
Ensure-Dir (Join-Path $MeshRoot "gamma\logs")

# Install Ollama
if (-not (Test-CommandExists "ollama")) {
  Write-Mesh "Instaluję Ollama..." "INFO"
  try {
    if (Install-WingetIfNeeded) {
      winget install Ollama.Ollama --accept-package-agreements --accept-source-agreements
    } else {
      $setup = Join-Path $env:TEMP "OllamaSetup.exe"
      Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $setup -UseBasicParsing
      Start-Process -FilePath $setup -Wait
    }
  } catch {
    Write-Mesh "Automatyczna instalacja nieudana — pobierz z https://ollama.com/download" "ERR"
    exit 1
  }
  Write-Mesh "Ollama zainstalowana — może wymagać nowego terminala." "WARN"
} else {
  Write-Mesh "Ollama już jest w PATH" "OK"
}

# Environment for LAN bind
# Machine-level so service-like starts pick it up
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:$OllamaPort", "Machine")
[System.Environment]::SetEnvironmentVariable("OLLAMA_MODELS", $ModelsDir, "Machine")
$env:OLLAMA_HOST = "0.0.0.0:$OllamaPort"
$env:OLLAMA_MODELS = $ModelsDir
Write-Mesh "OLLAMA_HOST=0.0.0.0:$OllamaPort (Machine env)" "OK"
Write-Mesh "OLLAMA_MODELS=$ModelsDir" "OK"

Ensure-Firewall-LocalOnly -Name "Ollama" -Port $OllamaPort -RemoteSubnet $Subnet

Write-HostsFileEntries -AlphaIp $AlphaIp -BetaIp $BetaIp -GammaIp $GammaIp

# Start scripts
$startOllama = Join-Path $MeshRoot "gamma\start-ollama.cmd"
Ensure-Dir (Join-Path $MeshRoot "gamma")
@"
@echo off
set OLLAMA_HOST=0.0.0.0:$OllamaPort
set OLLAMA_MODELS=$ModelsDir
echo === AgentMesh GAMMA · Ollama :$OllamaPort ===
echo Models: %OLLAMA_MODELS%
echo LAN only via firewall ($Subnet)
ollama serve
"@ | Set-Content -Path $startOllama -Encoding ASCII

$pullCmd = Join-Path $MeshRoot "gamma\pull-model.cmd"
@"
@echo off
set OLLAMA_HOST=127.0.0.1:$OllamaPort
echo Pull model: $Model
ollama pull $Model
ollama list
pause
"@ | Set-Content -Path $pullCmd -Encoding ASCII

# Try serve + pull
Write-Mesh "Uruchamiam ollama serve w tle..." "INFO"
$serve = Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden -PassThru -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

if (-not $SkipModelPull) {
  try {
    Write-Mesh "Pobieram model $Model (może potrwać)..." "INFO"
    & ollama pull $Model
    Write-Mesh "Model $Model gotowy" "OK"
  } catch {
    Write-Mesh "Pull nieudany teraz — uruchom później: $pullCmd" "WARN"
  }
}

# Smoke OpenAI-compatible path (Ollama /api/tags)
try {
  $tags = Invoke-RestMethod -Uri "http://127.0.0.1:$OllamaPort/api/tags" -TimeoutSec 5
  Write-Mesh "Ollama API OK — modele: $(($tags.models | ForEach-Object { $_.name }) -join ', ')" "OK"
} catch {
  Write-Mesh "API Ollama jeszcze nie odpowiada — zrestartuj PC / start-ollama.cmd" "WARN"
}

New-MeshNodeMarker -Root (Join-Path $MeshRoot "gamma") -Role "obliczenia" -Ip $GammaIp -Extra @{
  ollamaPort = $OllamaPort
  model = $Model
  modelsDir = $ModelsDir
}

Test-LanPeer -Ip $AlphaIp -Label "ALPHA"
Test-LanPeer -Ip $BetaIp -Label "BETA"

if ($serve -and -not $serve.HasExited) {
  # leave serve running
  Write-Mesh "ollama serve PID=$($serve.Id) działa w tle" "OK"
}

Write-Host ""
Write-Mesh "GAMMA gotowa (local LLM)." "OK"
Write-Host @"

Następne kroki na GAMMA:
  1. IP: $GammaIp
  2. Start: $startOllama
  3. Model: $pullCmd
  4. Test z ALPHA: curl http://${GammaIp}:$OllamaPort/api/tags
  5. Codex na ALPHA:
       codex --oss --local-provider ollama
       (base URL w ~/.codex/config.toml → http://${GammaIp}:$OllamaPort/v1)
  6. Firewall: port $OllamaPort TYLKO z $Subnet (już reguła AgentMesh-Ollama-*)

VRAM: dobierz model do karty (np. llama3.2, qwen2.5, mistral).

"@
