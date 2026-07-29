#Requires -Version 5.1
<#
.SYNOPSIS
  Diagnostyka sieci między ALPHA / BETA / GAMMA (uruchom na dowolnej stacji).
#>
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\config\cluster.env")
)

$Common = Join-Path $PSScriptRoot "common.ps1"
. $Common

Write-Mesh "=== AgentMesh · network check ===" "INFO"
$envMap = Import-ClusterEnv -Path $EnvFile
$AlphaIp = Get-EnvOr $envMap "ALPHA_IP" "10.20.0.10"
$BetaIp  = Get-EnvOr $envMap "BETA_IP" "10.20.0.20"
$GammaIp = Get-EnvOr $envMap "GAMMA_IP" "10.20.0.30"
$CorePort = [int](Get-EnvOr $envMap "CORE_PORT" "8765")
$OllamaPort = [int](Get-EnvOr $envMap "OLLAMA_PORT" "11434")

Write-Host ""
Write-Host "Lokalne adresy IP:" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" } |
  Select-Object InterfaceAlias, IPAddress, PrefixLength |
  Format-Table -AutoSize

$peers = @(
  @{ Name = "ALPHA"; Ip = $AlphaIp; Port = $null },
  @{ Name = "BETA-core"; Ip = $BetaIp; Port = $CorePort },
  @{ Name = "GAMMA-ollama"; Ip = $GammaIp; Port = $OllamaPort }
)

foreach ($p in $peers) {
  $ping = Test-Connection -ComputerName $p.Ip -Count 2 -Quiet -ErrorAction SilentlyContinue
  if ($ping) {
    Write-Mesh "$($p.Name) $($p.Ip) ICMP OK" "OK"
  } else {
    Write-Mesh "$($p.Name) $($p.Ip) ICMP FAIL" "ERR"
  }
  if ($p.Port) {
    try {
      $tcp = Test-NetConnection -ComputerName $p.Ip -Port $p.Port -WarningAction SilentlyContinue
      if ($tcp.TcpTestSucceeded) {
        Write-Mesh "$($p.Name) TCP:$($p.Port) OPEN" "OK"
      } else {
        Write-Mesh "$($p.Name) TCP:$($p.Port) CLOSED" "WARN"
      }
    } catch {
      Write-Mesh "$($p.Name) TCP:$($p.Port) test error" "WARN"
    }
  }
}

Write-Host ""
Write-Mesh "HTTP health (jeśli usługi włączone):" "INFO"
try {
  $h = Invoke-RestMethod -Uri "http://${BetaIp}:$CorePort/v1/health" -TimeoutSec 3
  Write-Mesh "Core: $($h | ConvertTo-Json -Compress)" "OK"
} catch { Write-Mesh "Core health niedostępny" "WARN" }

try {
  $t = Invoke-RestMethod -Uri "http://${GammaIp}:$OllamaPort/api/tags" -TimeoutSec 3
  Write-Mesh "Ollama models: $(($t.models | ForEach-Object name) -join ', ')" "OK"
} catch { Write-Mesh "Ollama tags niedostępne" "WARN" }

Write-Host ""
Write-Mesh "Gotowe." "OK"
