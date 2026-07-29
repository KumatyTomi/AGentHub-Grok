#Requires -Version 5.1
<#
.SYNOPSIS
  BETA — mesh-core 0.2 + firewall LAN + panel na :8765
#>
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\config\cluster.env"),
  [switch]$SkipUi
)

$Common = Join-Path $PSScriptRoot "common.ps1"
. $Common

Assert-Admin
Write-Mesh "=== BETA · mesh-core 0.2 (lokalnie) ===" "INFO"

$envMap = Import-ClusterEnv -Path $EnvFile
$AlphaIp  = Get-EnvOr $envMap "ALPHA_IP" "10.20.0.10"
$BetaIp   = Get-EnvOr $envMap "BETA_IP" "10.20.0.20"
$GammaIp  = Get-EnvOr $envMap "GAMMA_IP" "10.20.0.30"
$Gateway  = Get-EnvOr $envMap "CLUSTER_GATEWAY" "10.20.0.1"
$Subnet   = Get-EnvOr $envMap "CLUSTER_SUBNET" "10.20.0.0/24"
$MeshRoot = Get-EnvOr $envMap "MESH_ROOT" "E:\AgentMesh"
$BetaData = Get-EnvOr $envMap "BETA_DATA" "E:\AgentMesh\beta"
$CorePort = [int](Get-EnvOr $envMap "CORE_PORT" "8765")
$Cluster  = Get-EnvOr $envMap "CLUSTER_NAME" "MESH-LOCAL-01"
$NodeMajor = [int](Get-EnvOr $envMap "NODE_MAJOR" "22")

Set-StaticIpHint -Ip $BetaIp -Gateway $Gateway
Ensure-Dir $MeshRoot
Ensure-Dir $BetaData
Ensure-Dir (Join-Path $BetaData "data")
Ensure-Dir (Join-Path $BetaData "invites")
Ensure-Dir (Join-Path $BetaData "logs")
Ensure-Dir (Join-Path $BetaData "core")

Install-NodeLts -Major $NodeMajor
Ensure-Firewall-LocalOnly -Name "Core" -Port $CorePort -RemoteSubnet $Subnet
Write-HostsFileEntries -AlphaIp $AlphaIp -BetaIp $BetaIp -GammaIp $GammaIp

# Prefer packages/mesh-core from install pack (../core or ../../packages)
$srcCandidates = @(
  (Join-Path $PSScriptRoot "..\core"),
  (Join-Path $PSScriptRoot "..\..\packages\mesh-core"),
  (Join-Path $PSScriptRoot "..\packages\mesh-core")
)
$src = $null
foreach ($c in $srcCandidates) {
  if (Test-Path (Join-Path $c "server.mjs")) { $src = $c; break }
}
if (-not $src) {
  Write-Mesh "Brak packages/mesh-core — oczekiwano server.mjs w packu." "ERR"
  exit 1
}

$dest = Join-Path $BetaData "core"
Write-Mesh "Kopiuję mesh-core z $src → $dest" "INFO"
Copy-Item -Path (Join-Path $src "*") -Destination $dest -Recurse -Force

$startCore = Join-Path $MeshRoot "beta\start-core.cmd"
Ensure-Dir (Join-Path $MeshRoot "beta")
@"
@echo off
set CORE_PORT=$CorePort
set CORE_HOST=0.0.0.0
set CLUSTER_NAME=$Cluster
set MESH_DATA=$BetaData\data
set MESH_ROOT=$MeshRoot
set ALPHA_IP=$AlphaIp
set BETA_IP=$BetaIp
set GAMMA_IP=$GammaIp
set CORE_ENDPOINT=http://${BetaIp}:$CorePort
cd /d "$dest"
echo === AGentHub mesh-core :$CorePort ===
echo UI: http://127.0.0.1:$CorePort/
node server.mjs
"@ | Set-Content -Path $startCore -Encoding ASCII

New-MeshNodeMarker -Root (Join-Path $MeshRoot "beta") -Role "koordynator" -Ip $BetaIp -Extra @{
  corePort = $CorePort
  version = "0.2.0"
  touch = $true
  cluster = $Cluster
}

Write-Mesh "Test startu core (4s)..." "INFO"
$job = Start-Job -ScriptBlock {
  param($dir, $port, $data, $name, $bip)
  $env:CORE_PORT = "$port"
  $env:CORE_HOST = "127.0.0.1"
  $env:MESH_DATA = $data
  $env:CLUSTER_NAME = $name
  $env:BETA_IP = $bip
  Set-Location $dir
  node .\server.mjs
} -ArgumentList $dest, $CorePort, (Join-Path $BetaData "data"), $Cluster, $BetaIp
Start-Sleep -Seconds 3
try {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:$CorePort/v1/health" -TimeoutSec 3
  if ($h.ok) { Write-Mesh "Health OK v$($h.version) cluster=$($h.cluster)" "OK" }
} catch {
  Write-Mesh "Health test skip — uruchom $startCore" "WARN"
}
Stop-Job $job -ErrorAction SilentlyContinue
Remove-Job $job -Force -ErrorAction SilentlyContinue

Test-LanPeer -Ip $AlphaIp -Label "ALPHA"
Test-LanPeer -Ip $GammaIp -Label "GAMMA"

Write-Host ""
Write-Mesh "BETA gotowa — mesh-core 0.2" "OK"
Write-Host @"

Start:  $startCore
UI:     http://127.0.0.1:$CorePort/   (także z tabletu: http://${BetaIp}:$CorePort/)
API:    http://${BetaIp}:$CorePort/v1/health
PIN:    POST /v1/pin/set  {"pin":"123456"}

agentmesh-console (opcjonalnie): Local API → http://${BetaIp}:$CorePort

"@
