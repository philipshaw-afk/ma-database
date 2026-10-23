/* Admin: users (via the db-admin edge function) and the data import from the integrated-site mockup */
(function () {
  "use strict";
  const MAM = window.MAM, { $, $$, esc } = MAM;
  const when = t => t ? new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  async function call(body) {
    const { data, error } = await MAM.sb.functions.invoke("db-admin", { body });
    if (error) {
      let m = error.message;
      try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (e) {}
      throw new Error(m);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  function showResult(html, err) { const r = $("#adm-result"); r.hidden = false; r.className = "adm-result" + (err ? " err" : ""); r.innerHTML = html; }

  async function load() {
    const { data, error } = await MAM.sb.rpc("db_admin_members");
    if (error) { $("#adm-members").innerHTML = '<tbody><tr><td class="muted">' + esc(error.message) + "</td></tr></tbody>"; return; }
    const m = data.members || [];
    $("#adm-n").textContent = m.length;
    $("#adm-members").innerHTML = "<thead><tr><th>Name</th><th>Email</th><th>Organisation</th><th>Role</th><th>Status</th><th>Last seen</th><th class=\"r\">Views (30d)</th><th class=\"r\">PDFs (30d)</th><th class=\"r\">Actions</th></tr></thead><tbody>" +
      (m.length ? m.map(u => '<tr data-email="' + esc(u.email) + '"><td class="nm">' + esc(u.name || "—") + "</td><td>" + esc(u.email) + "</td><td>" + esc(u.organisation || "—") + "</td><td>" + (u.role === "admin" ? '<span class="pdtg rg-p2">Admin</span>' : "Client") + "</td><td>" + (u.active ? '<span class="stat stat-Completed">Active</span>' : '<span class="stat stat-Failed">Disabled</span>') + "</td><td><span class=\"dt\">" + esc(when(u.last_seen_at)) + '</span></td><td class="r num">' + u.views_30d + '</td><td class="r num">' + u.pdfs_30d + '</td><td class="r"><div class="adm-acts"><button type="button" class="btn ghost sm" data-act="pw">New password</button><button type="button" class="btn ghost sm" data-act="role">' + (u.role === "admin" ? "Make client" : "Make admin") + '</button><button type="button" class="btn ghost sm" data-act="active">' + (u.active ? "Disable" : "Enable") + "</button></div></td></tr>").join("")
        : '<tr><td colspan="9" class="muted" style="padding:16px">No client logins yet. Add one above.</td></tr>') + "</tbody>";
    const t = data.team || [];
    $("#adm-team").innerHTML = "<thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>" + t.map(u => "<tr><td class=\"nm\">" + esc(u.name) + "</td><td>" + esc(u.email) + "</td><td>" + (u.role === "admin" ? "Admin" : "Team") + "</td></tr>").join("") + "</tbody>";
    const a = data.recent || [];
    $("#adm-activity").innerHTML = "<thead><tr><th>When</th><th>Who</th><th>Deal</th><th>Action</th></tr></thead><tbody>" + (a.length ? a.map(x => { const r = MAM.byNo[x.deal]; return '<tr><td><span class="dt">' + esc(when(x.at)) + "</span></td><td>" + esc(x.email || "") + '</td><td><a class="dno" href="#deal/' + esc(x.deal) + '">' + esc(x.deal) + "</a> " + (r ? '<span class="muted">' + esc(MAM.tc(r.target)) + "</span>" : "") + "</td><td>" + ({ view: "Viewed", pdf: "Downloaded PDF", csv: "Exported data", doc: "Downloaded document" }[x.kind] || esc(x.kind)) + "</td></tr>"; }).join("") : '<tr><td colspan="4" class="muted" style="padding:16px">No activity yet.</td></tr>') + "</tbody>";
  }

  $("#adm-add").addEventListener("submit", async e => {
    e.preventDefault();
    const b = $("#adm-add-btn"), email = $("#adm-email").value.trim();
    if (!email) return;
    b.disabled = true; showResult("Adding " + esc(email) + "…");
    try {
      const r = await call({ action: "add", email, name: $("#adm-name").value.trim(), organisation: $("#adm-org").value.trim(), role: (document.querySelector('input[name="adm-role"]:checked') || {}).value, password: $("#adm-pass").value });
      showResult("<b>" + esc(r.email) + "</b> " + (r.created ? "now has a login." : "already had a login and now has access to the DataBase.") + (r.password ? ' Their password is <code class="pw">' + esc(r.password) + '</code> <button type="button" class="btn ghost sm" data-copy="' + esc(r.password) + '">Copy</button> — pass it on securely; it is not shown again.' : ""));
      e.target.reset(); load();
    } catch (err) { showResult(esc(err.message), true); }
    b.disabled = false;
  });
  $("#adm-result").addEventListener("click", e => { const c = e.target.closest("[data-copy]"); if (c && navigator.clipboard) navigator.clipboard.writeText(c.dataset.copy).then(() => MAM.toast("Password copied")); });
  $("#adm-members").addEventListener("click", async e => {
    const btn = e.target.closest("button[data-act]"); if (!btn) return;
    const tr = btn.closest("tr"), email = tr.dataset.email, act = btn.dataset.act;
    btn.disabled = true;
    try {
      if (act === "pw") {
        if (!confirm("Give " + email + " a new password? Their current password will stop working.")) { btn.disabled = false; return; }
        const r = await call({ action: "set_password", email });
        showResult("New password for <b>" + esc(email) + '</b>: <code class="pw">' + esc(r.password) + '</code> <button type="button" class="btn ghost sm" data-copy="' + esc(r.password) + '">Copy</button>');
        $("#adm-result").scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (act === "role") {
        await call({ action: "update", email, role: btn.textContent.includes("admin") ? "admin" : "client" }); load();
      } else if (act === "active") {
        await call({ action: "update", email, active: btn.textContent === "Enable" }); load();
      }
    } catch (err) { MAM.toast(err.message, true); }
    btn.disabled = false;
  });

  /* ---------------- data import from the mockup file ---------------- */
  let pending = null;
  const imp = { file: $("#imp-file"), name: $("#imp-fname"), prev: $("#imp-preview"), go: $("#imp-go"), log: $("#imp-log") };
  const block = (doc, id) => { const el = doc.getElementById(id); if (!el) return null; try { return JSON.parse(el.textContent); } catch (e) { return null; } };
  const UKCOLS = ["deal_no", "target", "bidder", "status", "possible_still_live", "year", "announced", "attitude", "cross_border", "equity_value_gbp_m", "prebid_premium_pct", "market", "sector", "is_scheme", "is_mbo", "consideration", "target_country", "had_pusu", "pusu_extended", "went_firm", "situation_id", "competitive", "contest_winner", "firm_to_completion_days", "offer_period_days", "offer_period_id", "increased", "increase_pct", "indicative_count", "indicative_raised"];
  const ukToIso = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || "").trim()); return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : null; };
  imp.file.addEventListener("change", async () => {
    const f = imp.file.files[0]; pending = null; imp.go.disabled = true; imp.prev.hidden = true; imp.log.textContent = "";
    if (!f) { imp.name.textContent = "No file chosen"; return; }
    imp.name.textContent = f.name + " · " + (f.size / 1048576).toFixed(1) + " MB · reading…";
    const doc = new DOMParser().parseFromString(await f.text(), "text/html");
    const pdb = block(doc, "pdb-data"), cal = block(doc, "cal-data"), os = block(doc, "os-data"), ofl = block(doc, "ofl-data");
    imp.name.textContent = f.name + " · " + (f.size / 1048576).toFixed(1) + " MB";
    if (!pdb && !os) { imp.prev.hidden = false; imp.prev.innerHTML = '<span class="err">This file does not contain the pending-offers or offer-statistics data. Choose an integrated site mockup file (mamonitorintegratedsite_8_2_24.html or later).</span>'; return; }
    const out = { status: [], events: [], uk: [], paths: [], meta: [] };
    if (pdb && pdb.deals) {
      const asOf = ukToIso(pdb.asOf) || new Date().toISOString().slice(0, 10);
      out.status = pdb.deals.map(d => { const x = {}; Object.keys(d).forEach(k => { if (!["notes", "web_fields", "file", "overview_first_para"].includes(k) && d[k] !== "" && d[k] != null) x[k] = d[k]; }); return { deal_no: d.deal_no, as_of: asOf, data: x }; });
      out.meta.push({ key: "offer_status_as_of", value: pdb.asOf || null }, { key: "offer_status_cols", value: pdb.cols || [] });
    }
    if (Array.isArray(cal)) out.events = cal.map(e => ({ event_date: e.d, kind: e.ty, label: e.l || null, detail: e.x || null, deal_no: e.dno || null, target: e.n || null, bidder: e.b || null, region: e.r || null, link: e.lk || null }));
    if (os && os.R) {
      out.uk = os.R.map(r => { const o = {}; UKCOLS.forEach((c, i) => { o[c] = r[i] === undefined ? null : r[i]; }); o.sector = o.sector != null ? os.sectors[o.sector] : null; const p = ofl && ofl[o.deal_no]; o.price_revised = p && p.rv != null ? p.rv : null; return o; });
      out.meta.push({ key: "uk_offer_stats_snap", value: os.snap || null });
    }
    if (ofl) out.paths = Object.keys(ofl).map(k => ({ deal_no: k, path: ofl[k] }));
    pending = out;
    imp.prev.hidden = false;
    imp.prev.innerHTML = "<b>Ready to load:</b> " + [[out.status.length, "pending offers with offer status" + (pdb && pdb.asOf ? " (as at " + esc(pdb.asOf) + ")" : "")], [out.events.length, "calendar events"], [out.uk.length, "UK & Irish offers for the statistics" + (os && os.snap ? " (data as at " + esc(os.snap) + ")" : "")], [out.paths.length, "offer price histories"]].filter(x => x[0]).map(x => "<span><b>" + x[0].toLocaleString("en-GB") + "</b> " + x[1] + "</span>").join(" · ");
    imp.go.disabled = false;
  });
  imp.go.addEventListener("click", async () => {
    if (!pending) return;
    if (!confirm("Replace the offer status, calendar and UK offer statistics data on the DataBase with the data in this file?")) return;
    imp.go.disabled = true;
    const send = async (kind, rows, size) => {
      for (let i = 0; i < rows.length; i += size) {
        imp.log.textContent = "Loading " + kind.replace("_", " ") + "… " + Math.min(i + size, rows.length) + " of " + rows.length;
        const { error } = await MAM.sb.rpc("db_admin_import", { p_kind: kind, p_rows: rows.slice(i, i + size), p_replace: i === 0 });
        if (error) throw new Error(kind + ": " + error.message);
      }
    };
    try {
      if (pending.status.length) await send("offer_status", pending.status, 40);
      if (pending.events.length) await send("events", pending.events, 500);
      if (pending.uk.length) await send("uk_offers", pending.uk, 500);
      if (pending.paths.length) await send("uk_paths", pending.paths, 400);
      if (pending.meta.length) await send("meta", pending.meta, 50);
      imp.log.textContent = "Done. Reloading the site data…";
      setTimeout(() => location.reload(), 900);
    } catch (e) { imp.log.textContent = "Stopped: " + e.message; imp.go.disabled = false; }
  });
  async function state() {
    const [a, b, c] = await Promise.all([
      MAM.sb.from("db_offer_status").select("deal_no", { count: "exact", head: true }),
      MAM.sb.from("db_uk_offers").select("id", { count: "exact", head: true }),
      MAM.sb.from("db_offer_events").select("id", { count: "exact", head: true })]);
    $("#imp-state").textContent = "On the DataBase now: " + (a.count || 0) + " offer-status records · " + (c.count || 0) + " calendar events · " + (b.count || 0) + " UK offers";
  }
  MAM.hooks["show:users"] = () => { load(); state(); };
})();
