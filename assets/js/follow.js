/* M&A DataBase · follow deals
   - a Follow button on each deal report
   - a bell in the header with a pop-up of report updates on the deals you follow
   - a "Deals you follow" card on Home
   An update is logged (db_deal_updates) when the M&A Monitor team has updated a deal's report and the new
   version is on this site. Follows and read/unread state live in db_follows, one row per login and deal. */
(function () {
  "use strict";
  const MAM = window.MAM, { $, $$, esc, sb } = MAM;
  const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const POLL = 5 * 60 * 1000;
  const st = { follows: new Map(), updates: [], loaded: false, busy: new Set(), at: 0 };
  let timer = null;
  const safe = (fn, d) => { try { return fn(); } catch (e) { return d; } };
  const name = no => { const r = MAM.byNo[no]; return r ? MAM.tc(r.target) : "Deal " + no; };
  const cap = s => String(s || "").replace(/^\s*([a-z])/, (m, c) => m.replace(c, c.toUpperCase()));
  const when = iso => {
    const d = new Date(iso); if (isNaN(d)) return "";
    const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(new Date()) - day(d)) / 864e5);
    if (diff === 0) return "Today, " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  };

  /* ---------- data ---------- */
  function take(data) {
    if (!data) return;
    st.follows = new Map((data.follows || []).map(f => [f.n, f]));
    // the same headline logged twice for a deal on one day (two cards for one event) is shown once
    const seen = new Set();
    st.updates = (data.updates || []).filter(u => { const k = u.n + "|" + String(u.h).toLowerCase() + "|" + String(u.at).slice(0, 10); if (seen.has(k)) return false; seen.add(k); return true; });
    st.loaded = true; st.at = Date.now();
    render();
  }
  async function call(fn, args) {
    const { data, error } = await sb.rpc(fn, args || {});
    if (error) throw error;
    take(data);
    return data;
  }
  const refresh = () => call("db_my_follows").then(autoPop).catch(e => console.warn("Follows:", e.message || e));
  const unread = () => st.updates.filter(u => u.new);

  MAM.isFollowing = no => st.follows.has(no);
  MAM.followBtn = no => {
    const on = st.follows.has(no);
    return '<button type="button" class="btn ghost fbtn" data-follow="' + esc(no) + '" aria-pressed="' + on + '" title="' + (on ? "Stop following this deal" : "See under the bell at the top of the page when this report is updated") + '">' + BELL + "<span>" + (on ? "Following" : "Follow") + "</span></button>";
  };
  /* opening a report marks that deal's updates as read */
  MAM.followOpened = no => {
    if (!st.follows.has(no) || !st.updates.some(u => u.n === no && u.new)) return;
    st.updates.forEach(u => { if (u.n === no) u.new = false; }); render();
    call("db_follows_seen", { p_deal_number: no }).catch(e => console.warn("Follows:", e.message || e));
  };

  async function toggle(no, btn) {
    if (!no || st.busy.has(no)) return;
    const on = !st.follows.has(no);
    st.busy.add(no); $$('[data-follow="' + no + '"]').forEach(b => b.disabled = true);
    try {
      await call("db_follow", { p_deal_number: no, p_follow: on });
      MAM.toast(on ? "Following " + name(no) + ". You'll see under the bell at the top of the page when its report is updated." : "Stopped following " + name(no) + ".");
    } catch (e) {
      MAM.toast("Could not " + (on ? "follow" : "unfollow") + " the deal: " + (e.message || e), true);
    } finally {
      st.busy.delete(no); render();
    }
  }

  /* ---------- rendering ---------- */
  const root = $("#fol"), bell = $("#fol-btn"), cnt = $("#fol-n"), pop = $("#fol-pop"), list = $("#fol-l");
  function render() {
    if (!root) return;
    root.hidden = !MAM.me || !MAM.me.role;
    const n = unread().length;
    cnt.hidden = !n; cnt.textContent = n > 99 ? "99+" : String(n);
    bell.classList.toggle("has", n > 0);
    bell.setAttribute("aria-label", n ? n + " new update" + (n === 1 ? "" : "s") + " on deals you follow" : "Updates on deals you follow");
    bell.title = n ? n + " new update" + (n === 1 ? "" : "s") + " on deals you follow" : "Updates on deals you follow";
    renderPop(); syncButtons(); renderHome();
  }
  function item(u) {
    return '<a class="fol-it' + (u.new ? " new" : "") + '" href="#deal/' + esc(u.n) + '"><i class="dot" aria-hidden="true"></i><b>' + esc(name(u.n)) + '</b><time datetime="' + esc(u.at) + '">' + esc(when(u.at)) + "</time><span>" + esc(cap(u.h)) + (u.new ? '<em class="vh"> (new)</em>' : "") + "</span></a>";
  }
  function renderPop() {
    const nf = st.follows.size, nu = unread().length;
    $("#fol-sub").textContent = !nf ? "You are not following any deals" : nu ? nu + " new · " + nf + " deal" + (nf === 1 ? "" : "s") + " followed" : "No new updates · " + nf + " deal" + (nf === 1 ? "" : "s") + " followed";
    $("#fol-read").hidden = !nu;
    $("#fol-all").textContent = nf ? "Deals you follow (" + nf + ")" : "Deals you follow";
    if (!nf) { list.innerHTML = '<div class="fol-empty">Press <b>Follow</b> at the top of a deal report and you\'ll see here when its report is updated, for example when an offer is increased, cleared or completed.</div>'; return; }
    if (!st.updates.length) { list.innerHTML = '<div class="fol-empty">No updates yet on the deal' + (nf === 1 ? "" : "s") + " you follow. They appear here once a report has been updated.</div>"; return; }
    const nw = st.updates.filter(u => u.new), old = st.updates.filter(u => !u.new).slice(0, Math.max(6, 25 - nw.length));
    list.innerHTML = (nw.length ? '<div class="fol-sep">New</div>' + nw.map(item).join("") : "") + (old.length ? '<div class="fol-sep">' + (nw.length ? "Earlier" : "Recent updates") + "</div>" + old.map(item).join("") : "");
  }
  function syncButtons() {
    $$("button.fbtn[data-follow]").forEach(b => {
      const no = b.dataset.follow, on = st.follows.has(no);
      b.setAttribute("aria-pressed", on); b.disabled = st.busy.has(no);
      const s = b.querySelector("span"); if (s) s.textContent = on ? "Following" : "Follow";
      b.title = on ? "Stop following this deal" : "See under the bell at the top of the page when this report is updated";
    });
  }
  function renderHome() {
    const t = $("#t-fol"); if (!t) return;
    const rows = [...st.follows.values()];
    $("#cnt-fol").textContent = rows.length;
    const head = '<thead><tr><th>Deal No</th><th>Target</th><th>Bidder</th><th>Status</th><th>Latest update</th><th class="r">Options</th></tr></thead>';
    if (!rows.length) { t.innerHTML = head + '<tbody><tr><td colspan="6" class="muted" style="padding:18px 16px">You are not following any deals yet. Press <b>Follow</b> at the top of a deal report to see here, and under the bell at the top of the page, when its report is updated.</td></tr></tbody>'; return; }
    const last = no => st.updates.find(u => u.n === no);
    rows.sort((a, b) => { const la = last(a.n), lb = last(b.n); return (lb ? +new Date(lb.at) : +new Date(b.since)) - (la ? +new Date(la.at) : +new Date(a.since)); });
    t.innerHTML = head + "<tbody>" + rows.map(f => {
      const r = MAM.byNo[f.n], u = last(f.n);
      const lu = u ? '<div class="lu' + (u.new ? " new" : "") + '">' + (u.new ? '<i aria-label="new"></i>' : "") + '<span title="' + esc(cap(u.h)) + '">' + esc(cap(u.h)) + "</span><small>" + esc(when(u.at)) + "</small></div>" : '<span class="muted">No updates yet</span>';
      return '<tr><td><a class="dno" href="#deal/' + esc(f.n) + '">' + esc(f.n) + '</a></td><td class="nm">' + (r ? esc(MAM.tc(r.target)) : '<span class="muted">No longer on the DataBase</span>') + "</td><td>" + (r ? esc(MAM.tc(r.bidder)) : "") + "</td><td>" + (r && r.deal_status ? '<span class="stat stat-' + esc(r.deal_status.split(" ")[0]) + '">' + esc(r.deal_status) + "</span>" : "") + "</td><td>" + lu + '</td><td class="r"><div class="ibs" style="justify-content:flex-end;gap:6px">' + (r ? '<a class="btn ghost sm" href="#deal/' + esc(f.n) + '">View</a>' : "") + '<button type="button" class="btn ghost sm" data-unfollow="' + esc(f.n) + '">Unfollow</button></div></td></tr>';
    }).join("") + "</tbody>";
  }

  /* ---------- pop-up ---------- */
  function openPop(auto) {
    if (!root || root.hidden) return;
    pop.hidden = false; bell.setAttribute("aria-expanded", "true");
    pop.classList.toggle("auto", !!auto);
    if (!auto) { const f = pop.querySelector("a,button"); if (f) f.focus({ preventScroll: true }); }
  }
  function closePop() { if (pop.hidden) return; pop.hidden = true; bell.setAttribute("aria-expanded", "false"); }
  // pops up by itself when there is something new since it last popped up in this browser session
  function autoPop() {
    const nw = unread(); if (!nw.length) return;
    const top = Math.max(...nw.map(u => +u.id || 0)), key = "mam-fol-pop:" + (MAM.me && MAM.me.email || "");
    if (top <= (+safe(() => sessionStorage.getItem(key), 0) || 0)) return;
    safe(() => sessionStorage.setItem(key, String(top)));
    openPop(true);
  }
  if (root) {
    bell.addEventListener("click", e => { e.stopPropagation(); pop.hidden ? openPop(false) : closePop(); });
    $("#fol-x").addEventListener("click", closePop);
    $("#fol-read").addEventListener("click", () => {
      st.updates.forEach(u => u.new = false); render();
      call("db_follows_seen", { p_deal_number: null }).catch(e => MAM.toast("Could not mark the updates as read: " + (e.message || e), true));
    });
    $("#fol-all").addEventListener("click", e => {
      e.preventDefault(); closePop();
      const go = () => { const c = $("#fol-card"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); };
      if (location.hash.slice(1).split("/")[0] === "lookup") go(); else { location.hash = "#lookup"; setTimeout(go, 120); }
    });
    list.addEventListener("click", e => { if (e.target.closest("a.fol-it")) closePop(); });
    document.addEventListener("click", e => { if (!pop.hidden && !e.target.closest("#fol")) closePop(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) { closePop(); bell.focus(); } });
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("button[data-follow],button[data-unfollow]"); if (!b) return;
    e.preventDefault(); toggle(b.dataset.follow || b.dataset.unfollow, b);
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && st.loaded && Date.now() - st.at > 2 * 60 * 1000) refresh(); });

  /* ---------- wiring into sign-in, loading and Home ---------- */
  const baseLoad = MAM.hooks.load;
  MAM.hooks.load = async function () {
    await baseLoad.apply(this, arguments);
    refresh();
    clearInterval(timer); timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, POLL);
  };
  const baseOut = MAM.hooks.signedOut;
  MAM.hooks.signedOut = function () {
    if (baseOut) baseOut.apply(this, arguments);
    clearInterval(timer); timer = null;
    st.follows = new Map(); st.updates = []; st.loaded = false;
    closePop(); if (root) root.hidden = true;
  };
  const baseHome = MAM.hooks["show:lookup"];
  MAM.hooks["show:lookup"] = function () { if (baseHome) baseHome.apply(this, arguments); renderHome(); };
})();
