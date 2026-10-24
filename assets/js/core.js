/* M&A Monitor DataBase website · core: Supabase client, sign-in, router, shared helpers */
(function () {
  "use strict";
  const C = window.MAM_CONFIG;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- session storage: "Remember me" keeps the login in localStorage, otherwise only for this browser tab session ---------- */
  const REM = "mam-db-remember";
  const safe = (fn, d) => { try { return fn(); } catch (e) { return d; } };
  const store = {
    getItem: k => safe(() => localStorage.getItem(k), null) ?? safe(() => sessionStorage.getItem(k), null),
    setItem: (k, v) => {
      const keep = safe(() => localStorage.getItem(REM) === "1", false);
      safe(() => (keep ? localStorage : sessionStorage).setItem(k, v));
      safe(() => (keep ? sessionStorage : localStorage).removeItem(k));
    },
    removeItem: k => { safe(() => localStorage.removeItem(k)); safe(() => sessionStorage.removeItem(k)); }
  };
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
    auth: { storage: store, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: "mam-db-auth" }
  });

  /* ---------- shared state ---------- */
  const MAM = window.MAM = {
    sb, $, $$, esc, me: undefined, ready: false,
    index: null, deals: [], byNo: {}, statusDeals: [], events: [], statusAsOf: null, statusAsOfText: "",
    ukStats: null, hooks: {}
  };

  /* ---------- small helpers ---------- */
  MAM.num = v => { if (v === "" || v == null) return null; const n = parseFloat(String(v).replace(/[,%\s£$€]/g, "")); return isNaN(n) ? null : n; };
  MAM.nf = (v, d = 0) => v == null || !isFinite(v) ? "—" : Number(v).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
  MAM.isoToUk = s => { if (!s) return ""; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? m[3] + "/" + m[2] + "/" + m[1] : String(s); };
  MAM.ukToTs = s => { const m = /^\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\s*$/.exec(String(s || "")); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; return +new Date(y, m[2] - 1, +m[1]); };
  MAM.isoToTs = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? +new Date(+m[1], m[2] - 1, +m[3]) : null; };
  MAM.longDate = s => { const t = MAM.isoToTs(s) ?? MAM.ukToTs(s); if (t == null) return ""; return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); };
  /* company names as written in reports: "SPIRE HEALTHCARE GROUP PLC" -> "Spire Healthcare Group plc".
     A word is spelt as the deal reports spell it where the DataBase has learnt that (MAM.caseMap, site-wide, and each deal's
     own spellings through MAM.nameDisp - both set by database.js from db_deal_index: TK, SFR, USI, BlackRock). Otherwise a
     word with no vowels is an acronym and stays in capitals ("BT", "KKR"), except the abbreviations in NOVOWEL, which the
     reports write as shown. Legal forms keep the house style below (plc, SpA, GmbH ...). */
  const LEGAL = { Spa: "SpA", Plc: "plc", Inc: "Inc", Ltd: "Ltd", Kgaa: "KGaA", Gmbh: "GmbH", Oyj: "Oyj", Sarl: "Sàrl", Srl: "Srl", Llc: "LLC", Llp: "LLP", Lp: "LP", Ii: "II", Iii: "III", Iv: "IV" };
  const LEGAL_U = new Set(["SPA", "SA", "SAD", "SAU", "SLU", "PLC", "AG", "SE", "NV", "INC", "LLC", "LLP", "LP", "ASA", "AB", "KGAA", "BV", "UK", "US", "USA", "GMBH", "OYJ", "AS", "SAS", "SRL", "SARL", "LTD", "PJSC", "JSC", "REIT", "II", "III", "IV"]);
  const NOVOWEL = { MR: "Mr", MRS: "Mrs", MS: "Ms", DR: "Dr", ST: "St", JR: "Jr", SR: "Sr", RT: "Rt", SP: "Sp", BHD: "Bhd", PVT: "Pvt", KFT: "Kft", ZRT: "Zrt", PCL: "Pcl", MFG: "Mfg", HF: "Hf", HG: "Hg", VP: "Vp", LXB: "Lxb", CHR: "Chr", SPRNG: "Sprng", DNB: "DnB", GFK: "GfK", MBH: "mbH" };
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  MAM.caseMap = {}; MAM.nameDisp = {};
  const caseWord = (t, nc) => {
    if (t.length < 2) return t;
    const u = t.toUpperCase();
    if (LEGAL_U.has(u)) return t;
    if (nc && own(nc, u)) return nc[u] || t;                        // the deal's own report ("" = plain capitalisation)
    if (own(MAM.caseMap, u)) return MAM.caseMap[u];
    if (/^[A-Z][a-z]{1,4}$/.test(t) && !/[aeiouy]/i.test(t)) return own(NOVOWEL, u) ? NOVOWEL[u] : u;
    return t;
  };
  MAM.tc = (x, nc) => {
    const s = String(x || "");
    if (!nc && own(MAM.nameDisp, s.toUpperCase())) return MAM.nameDisp[s.toUpperCase()];
    return s.toLowerCase().replace(/(^|[\s(\/&.-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase())
      .replace(/\b(Spa|Sa|Sad|Sau|Slu|Plc|Ag|Se|Nv|Inc|Llc|Llp|Lp|Asa|Ab|Kgaa|Bv|Uk|Us|Usa|Gmbh|Oyj|As|A\/s|Sas|Srl|Sarl|Ltd|Pjsc|Jsc|Reit|Ii|Iii|Iv)\b/g, w => LEGAL[w] || w.toUpperCase())
      .replace(/\bMc([a-z])/g, (m, a) => "Mc" + a.toUpperCase()).replace(/'S\b/g, "'s")
      .replace(/[A-Za-z0-9À-ÖØ-öø-ÿ]+/g, t => caseWord(t, nc));
  };
  MAM.fx = (v, from, to) => { if (v == null) return null; const f = C.fxPerGbp[(from || "").toUpperCase()], t = C.fxPerGbp[to]; if (!f || !t) return null; return v / f * t; };

  MAM.toast = (msg, err) => { const t = $("#toast"); if (!t) return; $("#toast-t").textContent = msg; t.classList.toggle("err", !!err); t.classList.add("on"); clearTimeout(MAM.toast.h); MAM.toast.h = setTimeout(() => t.classList.remove("on"), 4200); };

  MAM.csv = (cols, rows, name) => {
    const q = v => { v = v == null ? "" : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const out = [cols.map(c => q(c[0])).join(",")].concat(rows.map(r => cols.map(c => q(typeof c[1] === "function" ? c[1](r) : r[c[1]])).join(",")));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + out.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  MAM.odo = (el, n) => { if (!el) return; const s = Number(n).toLocaleString("en-GB"); el.innerHTML = [...s].map(c => c === "," ? '<span class="sep">,</span>' : "<span>" + c + "</span>").join(""); };

  MAM.log = (deal_number, kind) => { sb.from("db_activity").insert({ deal_number, kind }).then(({ error }) => { if (error) console.warn("activity log:", error.message); else if (MAM.hooks.activity) MAM.hooks.activity(); }); };

  /* ---------- product logos (from the integrated site design) ---------- */
  let lg = 0;
  const LOGO_MARK = {
    db: '<svg class="lg-mk" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="G@" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6A86FF"/><stop offset="1" stop-color="#3552DF"/></linearGradient></defs><rect width="40" height="40" rx="10" fill="url(#G@)"/><path d="M7.5 12h12.5v5.2a2.9 2.9 0 1 1 0 5.6V28H7.5z" fill="#fff"/><path d="M21.6 12H32.5v16H21.6v-5.2a2.9 2.9 0 1 0 0-5.6z" fill="#fff" fill-opacity=".42"/></svg>',
    arb: '<svg class="lg-mk" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="G@" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9B82FF"/><stop offset="1" stop-color="#5E3CE6"/></linearGradient></defs><rect width="40" height="40" rx="10" fill="url(#G@)"/><circle cx="18" cy="17.5" r="8.4" fill="#fff" fill-opacity=".14" stroke="#fff" stroke-width="3.2"/><path d="M24.4 23.9l6.3 6.3" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/><rect x="16.7" y="11.6" width="2.6" height="7.4" rx="1.3" fill="#FFC53D"/><circle cx="18" cy="22" r="1.5" fill="#FFC53D"/></svg>'
  };
  const LOGO_NAME = { db: "Data<b>Base</b>", arb: "<b>ARB</b>-Insight" };
  const LOGO_LABEL = { db: "M&amp;A DataBase", arb: "M&amp;A ARB-Insight" };
  MAM.logo = (p, cls) => { lg++; return '<span class="plogo plogo-' + p + (cls ? " " + cls : "") + '" role="img" aria-label="' + LOGO_LABEL[p] + '">' + LOGO_MARK[p].replace(/G@/g, "lg" + p + lg) + '<span class="lg-ma" aria-hidden="true">m&amp;a</span><span class="lg-dv" aria-hidden="true"></span><span class="lg-pn" aria-hidden="true">' + LOGO_NAME[p] + "</span></span>"; };
  $$("[data-logo]").forEach(el => { el.innerHTML = MAM.logo(el.dataset.logo, el.dataset.size || ""); });

  /* chips: <div class="chips" data-chips="A|B" data-on="A"> -> checkbox chips */
  let cid = 0;
  MAM.buildChips = root => $$("[data-chips]", root).forEach(el => {
    const on = (el.dataset.on || "").split("|");
    el.innerHTML = el.dataset.chips.split("|").map(c => { cid++; return '<label class="chip" for="ch' + cid + '" data-v="' + esc(c) + '"><input type="checkbox" id="ch' + cid + '"' + (on.includes(c) ? " checked" : "") + "> " + esc(c) + "</label>"; }).join("");
  });

  /* ---------- router ---------- */
  const DB = ["lookup", "search", "results", "deal", "calendar"], ARB = ["arb-stats", "arb-rev"], ADMIN = ["users"];
  const ALL = [...DB, ...ARB, ...ADMIN];
  MAM.route = function () {
    let raw = location.hash.slice(1);
    if (/access_token=|error_description=|type=recovery/.test(raw)) return;          // auth redirect fragments are handled by Supabase
    let [h, arg] = raw.split("/");
    if (!MAM.me) { showPage(MAM.me === null ? "login" : "loading"); return; }
    if (!MAM.me.role) { showPage("noaccess"); return; }
    if (!ALL.includes(h)) h = "lookup";
    if (ADMIN.includes(h) && MAM.me.role !== "admin") h = "lookup";
    showPage(null);
    $("#app").hidden = false;
    $$("#app [data-screen]").forEach(s => { s.hidden = s.dataset.screen !== h && !(s.dataset.also || "").split(" ").includes(h); });
    $("#sub-db").hidden = !DB.includes(h); $("#sub-arb").hidden = !ARB.includes(h);
    const g = DB.includes(h) ? "db" : ARB.includes(h) ? "arb" : "users";
    $$("#gnav a[data-g]").forEach(a => a.classList.toggle("on", a.dataset.g === g));
    $$(".subnav a.t[data-s]").forEach(a => a.classList.toggle("on", a.dataset.s.split(" ").includes(h)));
    document.title = ({ lookup: "Home", search: "Search", results: "Search results", deal: "Deal report", calendar: "Offer calendar", "arb-stats": "Offer statistics", "arb-rev": "Offer revisions", users: "Users" }[h] || "M&A DataBase") + " · M&A Monitor";
    if (!MAM.ready) return;                                  // data still loading: main.js re-routes when ready
    const fn = MAM.hooks["show:" + h]; if (fn) fn(arg);
    if (h !== "deal") window.scrollTo(0, 0);
  };
  function showPage(p) {
    $$("[data-page]").forEach(x => { x.hidden = x.dataset.page !== p; });
    if (p) { $("#app").hidden = true; $("#sub-db").hidden = true; $("#sub-arb").hidden = true; }
  }
  MAM.showPage = showPage;
  addEventListener("hashchange", () => MAM.route());

  /* open-deal links rendered by the calendar/dashboard (href="#deal" data-open-deal="0044244") */
  document.addEventListener("click", e => {
    const a = e.target.closest("a[data-open-deal]");
    if (a) { e.preventDefault(); location.hash = "#deal/" + a.dataset.openDeal + (a.dataset.openTab ? "/" + a.dataset.openTab : ""); return; }
    const c = e.target.closest("a[data-cal-q]"); if (c) safe(() => sessionStorage.setItem("mam-cal-q", c.dataset.calQ));
  });

  /* ---------- sign-in ---------- */
  const msg = (el, t, kind) => { el.hidden = !t; el.textContent = t || ""; el.className = "li-msg" + (kind ? " " + kind : ""); };
  const li = { form: $("#login-form"), email: $("#li-email"), pass: $("#li-pass"), rem: $("#li-rem"), warn: $("#li-warn"), msg: $("#li-msg"), go: $("#li-go") };
  li.rem.checked = safe(() => localStorage.getItem(REM) === "1", false);
  li.rem.addEventListener("change", () => { li.warn.hidden = !li.rem.checked; });
  const setRemember = () => safe(() => li.rem.checked ? localStorage.setItem(REM, "1") : localStorage.removeItem(REM));
  const redirect = () => location.origin + location.pathname;
  li.form.addEventListener("submit", async e => {
    e.preventDefault();
    const email = li.email.value.trim(), password = li.pass.value;
    if (!email || !password) { msg(li.msg, "Enter your email and password.", "err"); return; }
    setRemember(); li.go.disabled = true; msg(li.msg, "Signing in…");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    li.go.disabled = false;
    if (error) msg(li.msg, /invalid/i.test(error.message) ? "That email and password do not match." : error.message, "err");
    else { msg(li.msg, ""); li.pass.value = ""; }
  });
  $("#li-link").addEventListener("click", async () => {
    const email = li.email.value.trim(); if (!email) { msg(li.msg, "Enter your email first.", "err"); li.email.focus(); return; }
    setRemember(); msg(li.msg, "Sending…");
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirect() } });
    msg(li.msg, error ? (/signups? not allowed|not found/i.test(error.message) ? "That email has not been given a login." : error.message) : "Check your inbox for the sign-in link and open it in this browser.", error ? "err" : "ok");
  });
  $("#li-forgot").addEventListener("click", async () => {
    const email = li.email.value.trim(); if (!email) { msg(li.msg, "Enter your email first.", "err"); li.email.focus(); return; }
    msg(li.msg, "Sending…");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
    msg(li.msg, error ? error.message : "If that email has a login, a link to set a new password is on its way.", error ? "err" : "ok");
  });
  const signOut = async e => { if (e) e.preventDefault(); await sb.auth.signOut(); };
  $("#btn-logout").addEventListener("click", signOut);
  $("#na-out").addEventListener("click", signOut);

  /* account dialog: set / change password */
  const dlg = $("#dlg-account");
  const openAccount = (recovery) => {
    $("#acc-t").textContent = recovery ? "Set a new password" : "Your account";
    $("#acc-who").textContent = MAM.me ? "Signed in as " + (MAM.me.email || "") + (MAM.me.organisation ? " · " + MAM.me.organisation : "") : "";
    $("#acc-p1").value = $("#acc-p2").value = ""; msg($("#acc-msg"), "");
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  };
  MAM.openAccount = openAccount;
  $("#btn-account").addEventListener("click", () => openAccount(false));
  $("#acc-close").addEventListener("click", () => dlg.close());
  $("#acc-save").addEventListener("click", async () => {
    const a = $("#acc-p1").value, b = $("#acc-p2").value, m = $("#acc-msg");
    if (a.length < 10) { msg(m, "Use at least 10 characters.", "err"); return; }
    if (a !== b) { msg(m, "The two passwords are different.", "err"); return; }
    msg(m, "Saving…");
    const { error } = await sb.auth.updateUser({ password: a });
    msg(m, error ? error.message : "Password saved.", error ? "err" : "ok");
    if (!error) setTimeout(() => dlg.close(), 900);
  });

  /* ---------- session -> who am I -> load the data ---------- */
  let lastUser = undefined;
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "PASSWORD_RECOVERY") setTimeout(() => openAccount(true), 300);
    const uid = session ? session.user.id : null;
    if (uid === lastUser) return;
    lastUser = uid;
    if (!session) {
      MAM.me = null; MAM.ready = false;
      $("#user-chip").hidden = true; $$(".admin-only").forEach(x => x.hidden = true);
      if (MAM.hooks.signedOut) MAM.hooks.signedOut();
      MAM.route(); return;
    }
    if (/[?&]code=/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
    setTimeout(() => boot(session), 0);
  });

  async function boot(session) {
    MAM.me = undefined; showPage("loading");
    if (document.readyState === "loading") await new Promise(r => document.addEventListener("DOMContentLoaded", r, { once: true }));
    const { data: who, error } = await sb.rpc("db_whoami");
    if (error) { MAM.me = null; showPage("login"); msg(li.msg, "Could not check your access: " + error.message, "err"); return; }
    MAM.me = who || { role: null, email: session.user.email };
    $("#na-email").textContent = MAM.me.email || session.user.email || "";
    $("#user-chip").hidden = false;
    $("#user-email").textContent = MAM.me.email || "";
    const nm = (MAM.me.name || MAM.me.email || "?").replace(/@.*/, "");
    $("#btn-account").textContent = nm.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
    $$(".admin-only").forEach(x => x.hidden = MAM.me.role !== "admin");
    if (!MAM.me.role) { MAM.route(); return; }
    MAM.route();
    if (MAM.hooks.signedIn) { try { MAM.hooks.signedIn(); } catch (e) { console.warn(e); } }
    try { await MAM.hooks.load(); }
    catch (e) { console.error(e); $("#boot-msg").textContent = "Could not load the DataBase: " + (e.message || e); showPage("loading"); return; }
    MAM.ready = true;
    MAM.route();
  }
})();
