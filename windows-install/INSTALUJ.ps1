#Requires -Version 5.1
# AGentHub-Grok — bootstrap instalatora (Windows)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

Write-Host ""
Write-Host "  ╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║     AGentHub-Grok · instalator Windows (LAN)      ║" -ForegroundColor Cyan
Write-Host "  ║     ALPHA Codex · BETA core · GAMMA Ollama        ║" -ForegroundColor Cyan
Write-Host "  ╚════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Ensure cluster.env exists
$example = Join-Path $Root "config\cluster.env.example"
$envFile = Join-Path $Root "config\cluster.env"
if (-not (Test-Path $envFile)) {
  if (Test-Path $example) {
    Copy-Item $example $envFile
    Write-Host "  [OK] Utworzono config\cluster.env z przykładu." -ForegroundColor Green
    Write-Host "       Edytuj IP/ścieżki w Notatniku, potem wróć tutaj." -ForegroundColor Yellow
    Write-Host "       Plik: $envFile" -ForegroundColor Yellow
    $edit = Read-Host "  Otworzyć cluster.env w Notatniku teraz? [T/n]"
    if ($edit -notmatch '^[nN]') {
      Start-Process notepad.exe -ArgumentList $envFile -Wait
    }
  }
}

# Unblock scripts (Mark of the Web from ZIP/download)
Get-ChildItem -Path $Root -Recurse -Include *.ps1,*.bat,*.cmd,*.mjs |
  Unblock-File -ErrorAction SilentlyContinue

$guide = Join-Path $Root "install\install-all-guide.ps1"
if (-not (Test-Path $guide)) {
  Write-Host "  [BŁĄD] Brak install\install-all-guide.ps1" -ForegroundColor Red
  exit 1
}

& $guide -EnvFile $envFile
