#Requires -Version 5.1
<#
.SYNOPSIS
  Wspólne funkcje instalatora AgentMesh Local (Windows 10/11).
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Mesh {
  param([string]$Message, [ValidateSet("INFO","OK","WARN","ERR")]$Level = "INFO")
  $c = switch ($Level) {
    "OK"   { "Green" }
    "WARN" { "Yellow" }
    "ERR"  { "Red" }
    default { "Cyan" }
  }
  Write-Host ("[{0}] {1}" -f $Level, $Message) -ForegroundColor $c
}

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Mesh "Uruchom PowerShell jako Administrator." "ERR"
    exit 1
  }
}

function Import-ClusterEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    Write-Mesh "Brak pliku env: $Path — używam domyślnych wartości z przykładu." "WARN"
    return @{}
  }
  $map = @{}
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $i = $line.IndexOf("=")
    if ($i -lt 1) { return }
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim()
    $map[$k] = $v
  }
  Write-Mesh "Wczytano config: $Path" "OK"
  return $map
}

function Get-EnvOr {
  param($Map, [string]$Key, [string]$Default)
  if ($Map.ContainsKey($Key) -and $Map[$Key]) { return $Map[$Key] }
  return $Default
}

function Ensure-Dir {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
    Write-Mesh "Utworzono: $Path" "OK"
  }
}

function Ensure-Firewall-LocalOnly {
  param(
    [string]$Name,
    [int]$Port,
    [string]$RemoteSubnet = "10.20.0.0/24"
  )
  $ruleName = "AgentMesh-$Name-$Port"
  if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
    Write-Mesh "Firewall już istnieje: $ruleName" "INFO"
    return
  }
  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -RemoteAddress $RemoteSubnet `
    -Profile Any | Out-Null
  Write-Mesh "Firewall: TCP $Port tylko z $RemoteSubnet ($ruleName)" "OK"
}

function Set-StaticIpHint {
  param([string]$Ip, [string]$Gateway, [int]$Prefix = 24)
  Write-Mesh @"
Ustaw adres statyczny ręcznie (Ustawienia → Sieć) LUB:
  New-NetIPAddress -InterfaceAlias 'Ethernet' -IPAddress $Ip -PrefixLength $Prefix -DefaultGateway $Gateway
  Set-DnsClientServerAddress -InterfaceAlias 'Ethernet' -ServerAddresses $Gateway
(Zamień 'Ethernet' na nazwę Twojego adaptera: Get-NetAdapter)
"@ "WARN"
}

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-WingetIfNeeded {
  if (Test-CommandExists "winget") { return $true }
  Write-Mesh "winget niedostępny — zainstaluj 'App Installer' ze Store lub doinstaluj ręcznie." "WARN"
  return $false
}

function Install-NodeLts {
  param([int]$Major = 22)
  if (Test-CommandExists "node") {
    $v = (node -v)
    Write-Mesh "Node już jest: $v" "OK"
    return
  }
  if (Install-WingetIfNeeded) {
    Write-Mesh "Instaluję Node.js $Major przez winget..." "INFO"
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  } else {
    Write-Mesh "Zainstaluj Node $Major ręcznie: https://nodejs.org/" "ERR"
    exit 1
  }
  Write-Mesh "Node zainstalowany — otwórz NOWE okno PowerShell i kontynuuj." "WARN"
}

function Write-HostsFileEntries {
  param(
    [string]$AlphaIp,
    [string]$BetaIp,
    [string]$GammaIp
  )
  $hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
  $block = @"

# --- AgentMesh Local (auto) ---
$AlphaIp mesh-alpha alpha.mesh.local
$BetaIp mesh-beta beta.mesh.local mesh-core
$GammaIp mesh-gamma gamma.mesh.local ollama.mesh.local
# --- end AgentMesh ---
"@
  $existing = Get-Content $hosts -Raw -ErrorAction SilentlyContinue
  if ($existing -match "AgentMesh Local") {
    Write-Mesh "hosts już zawiera wpisy AgentMesh" "INFO"
    return
  }
  Add-Content -Path $hosts -Value $block -Encoding ascii
  Write-Mesh "Dodano wpisy mesh-* do pliku hosts" "OK"
}

function New-MeshNodeMarker {
  param(
    [string]$Root,
    [string]$Role,
    [string]$Ip,
    [hashtable]$Extra = @{}
  )
  Ensure-Dir $Root
  $meta = [ordered]@{
    role        = $Role
    ip          = $Ip
    hostname    = $env:COMPUTERNAME
    installedAt = (Get-Date).ToString("o")
    os          = [System.Environment]::OSVersion.VersionString
    extra       = $Extra
  }
  $path = Join-Path $Root "node.json"
  ($meta | ConvertTo-Json -Depth 6) | Set-Content -Path $path -Encoding UTF8
  Write-Mesh "Zapisano tożsamość węzła: $path" "OK"
}

function Test-LanPeer {
  param([string]$Ip, [string]$Label)
  Write-Mesh "Ping $Label ($Ip)..." "INFO"
  $ok = Test-Connection -ComputerName $Ip -Count 2 -Quiet -ErrorAction SilentlyContinue
  if ($ok) { Write-Mesh "$Label osiągalny" "OK" }
  else { Write-Mesh "$Label NIE odpowiada (sprawdź kabel/IP/firewall)" "WARN" }
  return $ok
}
