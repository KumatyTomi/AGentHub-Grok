#Requires -Version 5.1
<#
.SYNOPSIS
  BETA — koordynator touch: rdzeń AgentMesh :8765 + panel UI + firewall LAN-only.
.DESCRIPTION
  Ta maszyna jest "mózgiem" klastra (orkiestracja), NIE hostem modelu AI.
  UI operatorskie serwujesz lokalnie; dane na SSD MESH_ROOT.
.EXAMPLE
  .\02-beta-core.ps1 -EnvFile ..\config\cluster.env
#>
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\config\cluster.env"),
  [string]$UiSource = "",
  [switch]$SkipUi
)

$Common = Join-Path $PSScriptRoot "common.ps1"
. $Common

Assert-Admin
Write-Mesh "=== BETA · rdzeń klastra + panel (lokalnie) ===" "INFO"

$envMap = Import-ClusterEnv -Path $EnvFile
$AlphaIp  = Get-EnvOr $envMap "ALPHA_IP" "10.20.0.10"
$BetaIp   = Get-EnvOr $envMap "BETA_IP" "10.20.0.20"
$GammaIp  = Get-EnvOr $envMap "GAMMA_IP" "10.20.0.30"
$Gateway  = Get-EnvOr $envMap "CLUSTER_GATEWAY" "10.20.0.1"
$Subnet   = Get-EnvOr $envMap "CLUSTER_SUBNET" "10.20.0.0/24"
$MeshRoot = Get-EnvOr $envMap "MESH_ROOT" "E:\AgentMesh"
$BetaData = Get-EnvOr $envMap "BETA_DATA" "E:\AgentMesh\beta"
$CorePort = [int](Get-EnvOr $envMap "CORE_PORT" "8765")
$UiPort   = [int](Get-EnvOr $envMap "UI_PORT" "8080")
$Cluster  = Get-EnvOr $envMap "CLUSTER_NAME" "MESH-LOCAL-01"
$NodeMajor = [int](Get-EnvOr $envMap "NODE_MAJOR" "22")

Set-StaticIpHint -Ip $BetaIp -Gateway $Gateway

Ensure-Dir $MeshRoot
Ensure-Dir $BetaData
Ensure-Dir (Join-Path $BetaData "data")
Ensure-Dir (Join-Path $BetaData "invites")
Ensure-Dir (Join-Path $BetaData "logs")
Ensure-Dir (Join-Path $BetaData "core")
Ensure-Dir (Join-Path $BetaData "ui")

Install-NodeLts -Major $NodeMajor

# Firewall — TYLKO subnet klastra
Ensure-Firewall-LocalOnly -Name "Core" -Port $CorePort -RemoteSubnet $Subnet
Ensure-Firewall-LocalOnly -Name "UI" -Port $UiPort -RemoteSubnet $Subnet

Write-HostsFileEntries -AlphaIp $AlphaIp -BetaIp $BetaIp -GammaIp $GammaIp

# --- Minimalny rdzeń HTTP (placeholder do czasu pełnego AgentMesh-core) ---
# To jest LOKALNY proces Node, nie chmura. Zamień na prawdziwy core gdy gotowy.
$coreJs = Join-Path $BetaData "core\server.mjs"
@"
/**
 * AgentMesh Core — minimalny stub lokalny (Windows / Node).
 * Zastąp produkcyjnym binarnym/core gdy będzie gotowy.
 * Kontrakt zbliżony do agentmesh-console client:
 *   GET  /v1/health
 *   GET  /v1/cluster/snapshot
 *   POST /v1/*
 *   (WS /v1/events — tu niezaimplementowane w stubie)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CORE_PORT || $CorePort);
const CLUSTER = process.env.CLUSTER_NAME || "$Cluster";
const DATA = process.env.MESH_DATA || path.join(__dirname, "..", "data");

const snapshotPath = path.join(DATA, "snapshot.json");

function defaultSnapshot() {
  return {
    config: {
      clusterName: CLUSTER,
      endpoint: "http://$BetaIp:" + PORT,
      mode: "local",
      ssdPath: "$MeshRoot",
      pinSet: true,
      requirePinForSensitive: true,
      onboarded: true,
    },
    machines: [
      { id: "alpha", name: "ALPHA", host: "$AlphaIp", status: "online", role: "kodowanie" },
      { id: "beta", name: "BETA", host: "$BetaIp", status: "online", role: "koordynator" },
      { id: "gamma", name: "GAMMA", host: "$GammaIp", status: "online", role: "obliczenia" },
    ],
    tasks: [],
    projects: [],
    integrations: [
      {
        id: "ollama-gamma",
        name: "Ollama GAMMA",
        kind: "ai-adapter",
        baseUrl: "http://$GammaIp:11434/v1",
        enabled: true,
      },
    ],
    audit: [],
    trash: [],
    keys: [],
    notifications: [],
  };
}

function loadSnapshot() {
  try {
    if (fs.existsSync(snapshotPath)) {
      return JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    }
  } catch {}
  const s = defaultSnapshot();
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(s, null, 2));
  return s;
}

function saveSnapshot(s) {
  fs.writeFileSync(snapshotPath, JSON.stringify(s, null, 2));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const json = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/v1/health" && req.method === "GET") {
    return json(200, { ok: true, version: "local-stub-0.1", cluster: CLUSTER });
  }

  if (url.pathname === "/v1/cluster/snapshot" && req.method === "GET") {
    return json(200, loadSnapshot());
  }

  if (url.pathname.startsWith("/v1/") && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    const s = loadSnapshot();
    s.audit = s.audit || [];
    s.audit.unshift({
      id: "a-" + Date.now(),
      at: new Date().toISOString(),
      actor: "operator",
      action: url.pathname,
      severity: "info",
      detail: JSON.stringify(body).slice(0, 200),
    });
    saveSnapshot(s);
    return json(200, { accepted: true, path: url.pathname });
  }

  json(404, { error: "not found", path: url.pathname });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("[AgentMesh-core stub] listening on 0.0.0.0:" + PORT + " cluster=" + CLUSTER);
  console.log("[AgentMesh-core stub] data=" + DATA);
});
"@ | Set-Content -Path $coreJs -Encoding UTF8
Write-Mesh "Zapisano lokalny stub rdzenia: $coreJs" "OK"

# Start scripts
$startCore = Join-Path $MeshRoot "beta\start-core.cmd"
Ensure-Dir (Join-Path $MeshRoot "beta")
@"
@echo off
set CORE_PORT=$CorePort
set CLUSTER_NAME=$Cluster
set MESH_DATA=$BetaData\data
cd /d "$BetaData\core"
echo === AgentMesh BETA core :$CorePort ===
node server.mjs
"@ | Set-Content -Path $startCore -Encoding ASCII

# Scheduled task / auto-start hint
$startCorePs1 = Join-Path $BetaData "start-core.ps1"
@"
`$env:CORE_PORT = '$CorePort'
`$env:CLUSTER_NAME = '$Cluster'
`$env:MESH_DATA = '$(Join-Path $BetaData "data")'
Set-Location '$(Join-Path $BetaData "core")'
node .\server.mjs
"@ | Set-Content -Path $startCorePs1 -Encoding UTF8

# Invite template
$invite = Join-Path $BetaData "invites\AgentMesh-Invite.template.json"
@"
{
  "clusterName": "$Cluster",
  "coreEndpoint": "http://${BetaIp}:$CorePort",
  "subnet": "$Subnet",
  "issuedAt": "REPLACE_AT_RUNTIME",
  "expiresMinutes": 30,
  "fingerprint": "GENERATE_ON_REAL_CORE",
  "note": "Usuń plik po dołączeniu maszyny. To poświadczenie dostępu."
}
"@ | Set-Content -Path $invite -Encoding UTF8

# Optional UI: copy from repo if provided
if (-not $SkipUi) {
  if ($UiSource -and (Test-Path $UiSource)) {
    Write-Mesh "Kopiuję UI z $UiSource → $(Join-Path $BetaData 'ui')" "INFO"
    Copy-Item -Path (Join-Path $UiSource "*") -Destination (Join-Path $BetaData "ui") -Recurse -Force
  } else {
    Write-Mesh "Brak -UiSource. Panel możesz odpalić z repo agentmesh-console (npm run dev -- --host 0.0.0.0 --port $UiPort) na BETA." "WARN"
  }
  $startUi = Join-Path $MeshRoot "beta\start-ui.cmd"
  @"
@echo off
cd /d "$BetaData\ui"
if exist package.json (
  echo === AgentMesh UI :$UiPort ===
  call npm run dev -- --host 0.0.0.0 --port $UiPort
) else (
  echo Skopiuj build UI do $BetaData\ui albo uruchom agentmesh-console.
  pause
)
"@ | Set-Content -Path $startUi -Encoding ASCII
}

New-MeshNodeMarker -Root (Join-Path $MeshRoot "beta") -Role "koordynator" -Ip $BetaIp -Extra @{
  corePort = $CorePort
  uiPort = $UiPort
  touch = $true
  cluster = $Cluster
}

# Smoke: start core briefly? better leave to user
Write-Mesh "Test startu rdzenia (5s)..." "INFO"
$job = Start-Job -ScriptBlock {
  param($dir, $port, $data, $name)
  $env:CORE_PORT = "$port"
  $env:MESH_DATA = $data
  $env:CLUSTER_NAME = $name
  Set-Location $dir
  node .\server.mjs
} -ArgumentList (Join-Path $BetaData "core"), $CorePort, (Join-Path $BetaData "data"), $Cluster
Start-Sleep -Seconds 2
try {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:$CorePort/v1/health" -TimeoutSec 3
  if ($h.ok) { Write-Mesh "Health OK: $($h | ConvertTo-Json -Compress)" "OK" }
} catch {
  Write-Mesh "Health check nieudany w teście — uruchom ręcznie start-core.cmd" "WARN"
}
Stop-Job $job -ErrorAction SilentlyContinue
Remove-Job $job -Force -ErrorAction SilentlyContinue

Test-LanPeer -Ip $AlphaIp -Label "ALPHA"
Test-LanPeer -Ip $GammaIp -Label "GAMMA"

Write-Host ""
Write-Mesh "BETA gotowa (rdzeń lokalny)." "OK"
Write-Host @"

Następne kroki na BETA (touch):
  1. IP statyczne: $BetaIp
  2. Start rdzenia:  $startCore
  3. Panel: przeglądarka na tym PC lub tablecie LAN → http://${BetaIp}:$UiPort
     Local API endpoint: http://${BetaIp}:$CorePort
  4. SSD magazynu: $MeshRoot
  5. Zaproszenia: $BetaData\invites\  (usuń po użyciu)
  6. Ekran dotykowy: włącz duży UI / kiosk browser na http://127.0.0.1:$UiPort

PIN operatora ustaw ręcznie w prawdziwym core (stub nie egzekwuje PIN).

"@
