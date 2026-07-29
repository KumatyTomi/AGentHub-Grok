#Requires -Version 5.1
<#
.SYNOPSIS
  Interaktywny przewodnik — który skrypt odpalić na tej maszynie.
#>
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\config\cluster.env")
)

$Common = Join-Path $PSScriptRoot "common.ps1"
. $Common

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   AgentMesh LOCAL · instalacja na 3 komputerach     ║" -ForegroundColor Cyan
Write-Host "║   Wszystko w LAN · bez chmury (opcjonalnie Codex)   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $EnvFile)) {
  $example = Join-Path $PSScriptRoot "..\config\cluster.env.example"
  $target = Join-Path $PSScriptRoot "..\config\cluster.env"
  if (Test-Path $example) {
    Copy-Item $example $target
    Write-Mesh "Utworzono $target z przykładu — EDYTUJ IP/ścieżki przed instalacją." "WARN"
    $EnvFile = $target
  }
}

Write-Host "Na KTÓREJ maszynie jesteś teraz?"
Write-Host "  [1] ALPHA — dual monitor, Codex, git, kod"
Write-Host "  [2] BETA  — touch, rdzeń :8765, panel"
Write-Host "  [3] GAMMA — Ollama local LLM"
Write-Host "  [4] Tylko test sieci (dowolna)"
Write-Host "  [Q] Wyjście"
$choice = Read-Host "Wybór"

switch ($choice) {
  "1" { & (Join-Path $PSScriptRoot "01-alpha-codex.ps1") -EnvFile $EnvFile }
  "2" { & (Join-Path $PSScriptRoot "02-beta-core.ps1") -EnvFile $EnvFile }
  "3" { & (Join-Path $PSScriptRoot "03-gamma-ollama.ps1") -EnvFile $EnvFile }
  "4" { & (Join-Path $PSScriptRoot "00-network-check.ps1") -EnvFile $EnvFile }
  default { Write-Mesh "Anulowano." "INFO" }
}
