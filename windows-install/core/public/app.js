const $ = (s) => document.querySelector(s);

async function health() {
  const t0 = performance.now();
  const r = await fetch("/v1/health");
  const ms = Math.round(performance.now() - t0);
  const j = await r.json();
  $("#health").textContent = j.ok ? "OK" : "FAIL";
  $("#health").style.color = j.ok ? "var(--ok)" : "var(--danger)";
  $("#lat").textContent = ms + " ms";
  $("#online").textContent = String(j.machinesOnline ?? "—");
  return j;
}

async function snapshot() {
  const r = await fetch("/v1/cluster/snapshot");
  const s = await r.json();
  $("#cluster-name").textContent = s.config?.clusterName || "MESH";
  $("#endpoint").textContent = s.config?.endpoint || location.origin;
  $("#tasks").textContent = String(s.tasks?.length ?? 0);

  const root = $("#machines");
  root.innerHTML = "";
  for (const m of s.machines || []) {
    const el = document.createElement("div");
    el.className = "machine";
    const on = m.status === "online";
    const q = m.status === "kwarantanna";
    el.innerHTML = `
      <h3><span class="dot ${on ? "on" : q ? "q" : ""}"></span>${m.name}</h3>
      <div class="role">${m.role} · ${m.status}</div>
      <div class="meta">${m.host}<br/>replika ${m.replicaHealth}% · ${m.integrity}</div>
      <div class="meta">CPU ${Math.round(m.metrics?.cpu ?? 0)}% · RAM ${Math.round(m.metrics?.ram ?? 0)}%</div>
      <div class="bar"><i style="width:${m.metrics?.cpu ?? 0}%"></i></div>
    `;
    root.appendChild(el);
  }

  const audit = $("#audit");
  audit.innerHTML = "";
  for (const a of (s.audit || []).slice(0, 16)) {
    const li = document.createElement("li");
    li.innerHTML = `<b>${a.action}</b> · ${a.detail} <span style="opacity:.6">${a.at?.slice(11, 19) || ""}</span>`;
    audit.appendChild(li);
  }

  const tl = $("#tasklist");
  tl.innerHTML = "";
  if (!s.tasks?.length) {
    tl.innerHTML = `<p class="muted">Brak zadań — dodaj z panelu akcji.</p>`;
  } else {
    for (const t of s.tasks.slice(0, 12)) {
      const d = document.createElement("div");
      d.className = "task";
      d.innerHTML = `<strong>${t.title}</strong> · ${t.state} · ${t.assignedTo || "—"} · ${t.progress}%
        <div class="bar"><i style="width:${t.progress}%"></i></div>`;
      tl.appendChild(d);
    }
  }
  return s;
}

async function cmd(path, body = {}) {
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
  }
  await refresh();
}

function bindActions() {
  document.querySelectorAll("[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", () => {
      let body = {};
      try {
        body = JSON.parse(btn.getAttribute("data-body") || "{}");
      } catch {
        body = {};
      }
      cmd(btn.getAttribute("data-cmd"), body);
    });
  });
}

async function refresh() {
  try {
    await health();
    await snapshot();
  } catch (e) {
    $("#health").textContent = "DOWN";
    $("#health").style.color = "var(--danger)";
  }
}

// live events
try {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/v1/events`);
  ws.onmessage = () => refresh();
} catch {
  /* optional */
}

bindActions();
refresh();
setInterval(refresh, 4000);
