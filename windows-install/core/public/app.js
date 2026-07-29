const $ = (s) => document.querySelector(s);

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}

async function health() {
  const t0 = performance.now();
  const r = await fetch("/v1/health");
  const ms = Math.round(performance.now() - t0);
  const j = await r.json();
  $("#health").textContent = j.ok ? "OK" : "FAIL";
  $("#health").style.color = j.ok ? "var(--ok)" : "var(--danger)";
  $("#lat").textContent = ms + " ms";
  $("#online").textContent = String(j.machinesOnline ?? "—");
  $("#probe").textContent = j.environmentProbed ? "ON" : "OFF";
  $("#probe").style.color = j.environmentProbed ? "var(--ok)" : "var(--warn)";
  return j;
}

async function envPanel() {
  const r = await fetch("/v1/env");
  const j = await r.json();
  const e = j.environment || {};
  const root = $("#env-panel");
  const tools = e.tools || {};
  const toolBits = [
    tools.node ? "node " + tools.node : null,
    tools.codex ? "codex OK" : "codex —",
    tools.git ? "git OK" : "git —",
    tools.ollama ? "ollama OK" : "ollama —",
  ]
    .filter(Boolean)
    .join(" · ");

  const load = Array.isArray(e.cpu && e.cpu.loadAvg) ? e.cpu.loadAvg.join(", ") : "—";

  root.innerHTML =
    '<div class="env-card"><span class="k">Host</span><strong>' +
    esc(e.hostname) +
    '</strong><span class="v">' +
    esc(e.primaryIp) +
    " · " +
    esc(e.platform) +
    "/" +
    esc(e.arch) +
    "</span></div>" +
    '<div class="env-card"><span class="k">CPU</span><strong>' +
    esc(e.cpu && e.cpu.model) +
    '</strong><span class="v">' +
    esc(e.cpu && e.cpu.cores) +
    " cores · load " +
    esc(load) +
    "</span></div>" +
    '<div class="env-card"><span class="k">RAM</span><strong>' +
    esc(e.memory && e.memory.totalGb) +
    ' GB</strong><span class="v">użycie ' +
    esc(e.memory && e.memory.usedPercent) +
    "%</span></div>" +
    '<div class="env-card"><span class="k">GPU</span><strong>' +
    esc((e.gpu && e.gpu.name) || "nie wykryto") +
    '</strong><span class="v">' +
    esc(e.gpu && e.gpu.vramMb ? e.gpu.vramMb + " MB VRAM" : "—") +
    "</span></div>" +
    '<div class="env-card"><span class="k">Dysk</span><strong>' +
    esc(e.disk ? e.disk.path : "—") +
    '</strong><span class="v">' +
    esc(e.disk ? e.disk.usedPercent + "% z " + e.disk.totalTb + " TB" : "brak odczytu") +
    "</span></div>" +
    '<div class="env-card"><span class="k">Narzędzia</span><strong>local machine = ' +
    esc(j.localMachineId || "—") +
    '</strong><span class="v">' +
    esc(toolBits) +
    "</span></div>";
}

async function snapshot() {
  const r = await fetch("/v1/cluster/snapshot");
  const s = await r.json();
  $("#cluster-name").textContent = (s.config && s.config.clusterName) || "MESH";
  $("#endpoint").textContent = (s.config && s.config.endpoint) || location.origin;
  $("#tasks").textContent = String((s.tasks && s.tasks.length) || 0);

  const root = $("#machines");
  root.innerHTML = "";
  for (const m of s.machines || []) {
    const el = document.createElement("div");
    el.className = "machine";
    const on = m.status === "online";
    const q = m.status === "kwarantanna";
    const hw = m.hardware || {};
    const env = m.environment;
    const probedAt = env && env.probedAt ? String(env.probedAt).slice(11, 19) : "";
    const cpuPct = Math.round((m.metrics && m.metrics.cpu) || 0);
    const ramPct = Math.round((m.metrics && m.metrics.ram) || 0);
    const diskPct = Math.round((m.metrics && m.metrics.disk) || 0);
    el.innerHTML =
      '<h3><span class="dot ' +
      (on ? "on" : q ? "q" : "") +
      '"></span>' +
      esc(m.name) +
      "</h3>" +
      '<div class="role">' +
      esc(m.role) +
      " · " +
      esc(m.status) +
      "</div>" +
      '<div class="meta">' +
      esc(m.host) +
      " · " +
      esc(m.os) +
      "<br/>replika " +
      esc(m.replicaHealth) +
      "% · " +
      esc(m.integrity) +
      "</div>" +
      '<div class="meta"><b>CPU</b> ' +
      esc(hw.cpu || "—") +
      "<br/><b>GPU</b> " +
      esc(hw.gpu || "—") +
      "<br/>" +
      esc(hw.ramGb || 0) +
      " GB RAM · " +
      esc(hw.vramGb || 0) +
      " GB VRAM · " +
      esc(hw.diskTb || 0) +
      " TB</div>" +
      '<div class="meta">CPU ' +
      cpuPct +
      "% · RAM " +
      ramPct +
      "% · Dysk " +
      diskPct +
      "%</div>" +
      '<div class="bar"><i style="width:' +
      cpuPct +
      '%"></i></div>' +
      (env
        ? '<div class="meta probed">sonda ' + esc(env.hostname) + " · " + esc(probedAt) + "</div>"
        : '<div class="meta muted">brak sondy — uruchom node-agent</div>');
    root.appendChild(el);
  }

  const audit = $("#audit");
  audit.innerHTML = "";
  for (const a of (s.audit || []).slice(0, 16)) {
    const li = document.createElement("li");
    const at = a.at ? String(a.at).slice(11, 19) : "";
    li.innerHTML =
      "<b>" +
      esc(a.action) +
      "</b> · " +
      esc(a.detail) +
      ' <span style="opacity:.6">' +
      esc(at) +
      "</span>";
    audit.appendChild(li);
  }

  const tl = $("#tasklist");
  tl.innerHTML = "";
  if (!s.tasks || !s.tasks.length) {
    tl.innerHTML = '<p class="muted">Brak zadań — dodaj z panelu akcji.</p>';
  } else {
    for (const t of s.tasks.slice(0, 12)) {
      const d = document.createElement("div");
      d.className = "task";
      d.innerHTML =
        "<strong>" +
        esc(t.title) +
        "</strong> · " +
        esc(t.state) +
        " · " +
        esc(t.assignedTo || "—") +
        " · " +
        t.progress +
        '%<div class="bar"><i style="width:' +
        t.progress +
        '%"></i></div>';
      tl.appendChild(d);
    }
  }
  return s;
}

async function cmd(path, body) {
  body = body || {};
  const pin = $("#pin").value.trim();
  if (pin) body.pin = pin;
  const r = await fetch("/v1/" + path.replace(/^\//, ""), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) alert(j.error || "Błąd " + r.status);
  else if (j.invite) {
    alert("Invite: " + j.invite.id + "\nEndpoint: " + j.invite.coreEndpoint + "\nUsuń po użyciu.");
  } else if (j.environment) {
    alert(
      "Sonda OK\n" +
        j.environment.hostname +
        " · " +
        j.environment.primaryIp +
        "\n" +
        (j.environment.cpu && j.environment.cpu.model) +
        "\n" +
        (j.environment.memory && j.environment.memory.totalGb) +
        " GB RAM",
    );
  }
  await refresh();
}

function bindActions() {
  document.querySelectorAll("[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", () => {
      let body = {};
      try {
        body = JSON.parse(btn.getAttribute("data-body") || "{}");
      } catch (e) {
        body = {};
      }
      cmd(btn.getAttribute("data-cmd"), body);
    });
  });
}

async function refresh() {
  try {
    await health();
    await Promise.all([snapshot(), envPanel()]);
  } catch (e) {
    $("#health").textContent = "DOWN";
    $("#health").style.color = "var(--danger)";
  }
}

try {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(proto + "://" + location.host + "/v1/events");
  ws.onmessage = () => refresh();
} catch (e) {
  /* optional */
}

bindActions();
refresh();
setInterval(refresh, 4000);
