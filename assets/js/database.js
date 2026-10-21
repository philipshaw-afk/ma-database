/* M&A DataBase · deal index, Home (lookup), Search Form and Search Results */
(function () {
  "use strict";
  const MAM = window.MAM, { $, $$, esc, num, nf } = MAM;
  const has = v => v !== null && v !== undefined && v !== "";
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const pct = (v, dp = 2) => v == null || v === "" ? "—" : (+v).toLocaleString("en-GB", { maximumFractionDigits: dp }) + "%";
  const trunc = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 2) + " …" : s; };
  const ICON = {
    view: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
    pdf: '<span class="pdfi">PDF</span>',
    dl: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>'
  };
  const REGION = { uk_ie: "UK & Ireland", fr_it: "France & Italy", western: "Other Western Europe", other_europe: "Central & Eastern Europe", non_europe: "Outside Europe" };

  /* ---------------- build the merged deal list ---------------- */
  const F = (f, k) => f && f[k] != null && f[k] !== "" ? f[k] : null;
  const cleanAdv = s => String(s || "").replace(/\s+/g, " ").trim();
  function fromIndex(x, s) {
    const f = x.f || {};
    const eq = num(F(f, "Implied Total Equity Value")) ?? (x.v != null ? +x.v : null);
    const ev = num(F(f, "Enterprise Value"));
    const r = {
      deal_no: x.n, target: x.t || "", bidder: x.b || "", divestor: x.s || F(f, "Ultimate Divestor name") || "",
      ultimate_bidder: F(f, "Ultimate Bidder") || "", bidding_sub: F(f, "pdf_bidding_subsidiary") || "",
      target_country: x.tc || "", bidder_country: x.bc || "", divestor_country: x.sc || "", region: x.rg || "",
      pub: !!x.pub, sector: x.sec || "", deal_type: (x.ty || "").replace(/\s+\/\s+/g, " / ").trim(), deal_status: x.st || "",
      attitude: F(f, "Deal Attitude") || "", consideration: F(f, "Consideration type") || "",
      activities: F(f, "Target Activities") || "", stock_index: F(f, "pdf_stock_index") || "",
      currency: x.cur || "", equity_value: eq, enterprise_value: ev,
      premium: num(F(f, "Pre-bid speculation premium")), ev_ebitda: num(F(f, "Enterprise Value/EBITDA")), ev_sales: num(F(f, "Enterprise Value/Sales")),
      pe: num(F(f, "Price/Earnings")), pb: num(F(f, "Price/Book")),
      sales: num(F(f, "Turnover (Sales)")), ebitda: num(F(f, "EBITDA")), net_income: num(F(f, "Net Income (Earnings)")),
      adv_bl: cleanAdv(F(f, "Bidder's Legal Advisor")), adv_bf: cleanAdv(F(f, "Bidder's Financial Advisor")),
      adv_tl: cleanAdv(F(f, "Target/Divestor's Legal Advisor")), adv_tf: cleanAdv(F(f, "Target/Divestor's Financial Advisor")),
      offer_price: x.op != null ? +x.op : null, offer_currency: x.opc || "",
      date_announced: MAM.isoToUk(x.da), _ann: MAM.isoToTs(x.da), _add: MAM.isoToTs(x.add), pdf: x.p || null, has_report: true
    };
    if (s) mergeStatus(r, s);
    if (!has(r.cross_border) && r.target_country && r.bidder_country) r.cross_border = norm(r.target_country) === norm(r.bidder_country) ? "No" : "Yes";
    if (r.equity_value_gbp == null) r.equity_value_gbp = MAM.fx(r.equity_value, r.currency, "GBP");
    return r;
  }
  /* offer-status fields from the pending-offers database; DIANA's own deal status wins where it has moved on */
  function mergeStatus(r, s) {
    Object.keys(s).forEach(k => { if (!has(r[k]) && has(s[k])) r[k] = s[k]; });
    r.has_status = true;
    if (/^Completed/i.test(r.deal_status) && !/^Completed/.test(s.current_status || "")) r.current_status = "Completed";
    else if (/^Failed/i.test(r.deal_status) && !/Lapsed|Withdrawn|Superseded/.test(s.current_status || "")) r.current_status = "Lapsed";
    else r.current_status = s.current_status || "Pending";
    ["equity_value_gbp", "pct_owned", "pct_bid_for"].forEach(k => { if (has(s[k])) r[k] = num(s[k]); });
  }
  function fromStatusOnly(no, s) {
    const r = { deal_no: no, target: s.target || "", bidder: s.bidder || "", divestor: s.divestor || "", pub: true, has_report: false,
      date_announced: s.date_announced || "", _ann: MAM.ukToTs(s.date_announced), _add: null,
      equity_value: num(s.equity_value), enterprise_value: num(s.enterprise_value), currency: s.currency || "",
      sales: num(s.sales), ebitda: num(s.ebitda), ev_ebitda: num(s.ev_ebitda) };
    mergeStatus(r, s);
    return r;
  }
  MAM.buildDeals = function (idx) {
    const st = idx.status || {};
    const out = [], by = {};
    (idx.deals || []).forEach(x => { const r = fromIndex(x, st[x.n]); out.push(r); by[r.deal_no] = r; });
    Object.keys(st).forEach(no => { if (!by[no]) { const r = fromStatusOnly(no, st[no]); out.push(r); by[no] = r; } });
    out.forEach(r => { r._txt = [r.target, r.bidder, r.ultimate_bidder, r.bidding_sub, r.divestor].join(" ").toLowerCase(); });
    MAM.deals = out; MAM.byNo = by;
    MAM.statusDeals = out.filter(r => r.has_status);
    MAM.statusAsOf = idx.status_as_of || null;
    MAM.statusAsOfText = MAM.isoToUk(idx.status_as_of || "");
    return out;
  };
  MAM.dealLabel = r => MAM.tc(r.target);

  /* ---------------- HOME ---------------- */
  const th = cols => "<thead><tr>" + cols.map(c => '<th class="' + (c[1] || "") + '">' + c[0] + "</th>").join("") + "</tr></thead>";
  const dateCell = d => '<span class="dt">' + (d || "—") + "</span>";
  const ccode = c => { const m = { "United Kingdom": "UKE", "Ireland": "IRE", "Ireland (Republic of)": "IRE", "United States": "USA", "USA": "USA", "France": "FRA", "Germany": "GER", "Italy": "ITA", "Spain": "SPA", "Netherlands": "NEE", "Belgium": "BEL", "Switzerland": "SWI", "Sweden": "SWE", "Norway": "NOR", "Denmark": "DEN", "Finland": "FIN", "Poland": "POL", "Portugal": "POR", "Austria": "AUS", "Greece": "GRE", "Luxembourg": "LUX", "Canada": "CAN", "Australia": "ASL", "Japan": "JAP", "India": "IND", "Brazil": "BRA", "China": "CHI" }; c = String(c || "").trim(); return c ? (m[c] || c.slice(0, 3).toUpperCase()) : "—"; };
  MAM.ccode = ccode;
  const rowLink = (r, extra) => '<a class="dno" href="#deal/' + r.deal_no + '">' + r.deal_no + "</a>";
  function smallTable(el, rows, dateKey, dateLab) {
    const hd = [["Deal No"], ["Country"], ["Target"], ["Bidder"], [dateLab || "Announced"], ["Options", "r"]];
    el.innerHTML = th(hd) + "<tbody>" + (rows.length ? rows.map(({ r, d }) => "<tr><td>" + rowLink(r) + '</td><td><span class="ccode">' + esc(ccode(r.target_country)) + '</span></td><td class="nm" title="' + esc(r.target) + '">' + esc(trunc(r.target, 30)) + '</td><td title="' + esc(r.bidder) + '">' + esc(trunc(r.bidder, 28)) + "</td><td>" + dateCell(d || r.date_announced) + '</td><td class="r"><div class="ibs" style="justify-content:flex-end">' + (r.has_report ? '<a class="ib" href="#deal/' + r.deal_no + '" title="Open the deal report">' + ICON.view + "</a>" : "") + (r.pdf ? '<a class="ib" href="#" data-pdf="' + r.deal_no + '" title="Download the PDF report">' + ICON.pdf + "</a>" : "") + "</div></td></tr>").join("") : '<tr><td colspan="6" class="muted" style="padding:18px 16px">Nothing yet.</td></tr>') + "</tbody>";
  }
  async function loadActivity() {
    const { data, error } = await MAM.sb.from("db_activity").select("deal_number,kind,at").eq("user_id", ((await MAM.sb.auth.getSession()).data.session || { user: {} }).user.id).order("at", { ascending: false }).limit(300);
    if (error) { console.warn(error.message); return; }
    const pick = kind => { const seen = new Set(), out = []; data.filter(a => a.kind === kind).forEach(a => { if (seen.has(a.deal_number) || !MAM.byNo[a.deal_number]) return; seen.add(a.deal_number); out.push({ r: MAM.byNo[a.deal_number], d: MAM.isoToUk(a.at) }); }); return out.slice(0, 6); };
    const v = pick("view"), p = pick("pdf");
    smallTable($("#t-viewed"), v, null, "Viewed"); smallTable($("#t-downloaded"), p, null, "Downloaded");
    $("#cnt-viewed").textContent = v.length; $("#cnt-downloaded").textContent = p.length;
  }
  MAM.hooks.activity = () => { if (!$('[data-screen="lookup"]').hidden) loadActivity(); else MAM._actDirty = true; };
  function renderAdded() {
    const sec = $("#lk-sector").value;
    const rows = MAM.deals.filter(r => r.has_report && r._add && (!sec || r.sector.split(" / ").map(s => s.trim()).includes(sec)))
      .sort((a, b) => b._add - a._add || (b.deal_no > a.deal_no ? 1 : -1)).slice(0, 12);
    const el = $("#t-added");
    el.innerHTML = th([["Deal No"], ["Added"], ["Country"], ["Target"], ["Bidder"], ["Announced"], ["Status"], ["Options", "r"]]) + "<tbody>" + rows.map(r => "<tr><td>" + rowLink(r) + "</td><td>" + dateCell(new Date(r._add).toLocaleDateString("en-GB")) + '</td><td><span class="ccode">' + esc(ccode(r.target_country)) + '</span></td><td class="nm" title="' + esc(r.target) + '">' + esc(trunc(r.target, 34)) + '</td><td title="' + esc(r.bidder) + '">' + esc(trunc(r.bidder, 30)) + "</td><td>" + dateCell(r.date_announced) + '</td><td><span class="stat stat-' + esc(r.deal_status || "Pending") + '">' + esc(r.deal_status || "—") + '</span></td><td class="r"><a class="btn ghost sm" href="#deal/' + r.deal_no + '">View</a></td></tr>').join("") + "</tbody>";
  }
  let homeInit = false;
  MAM.hooks["show:lookup"] = () => {
    if (!homeInit) {
      homeInit = true;
      const secs = [...new Set(MAM.deals.flatMap(r => String(r.sector || "").split(" / ").map(s => s.trim()).filter(Boolean)))].sort();
      $("#lk-sector").innerHTML = '<option value="">All sectors</option>' + secs.map(s => "<option>" + esc(s) + "</option>").join("");
      $("#lk-sector").addEventListener("change", renderAdded);
      MAM.odo($("#home-odo"), MAM.deals.filter(r => r.has_report).length);
    }
    if (window.__dashRender) window.__dashRender();
    renderAdded(); loadActivity();
  };

  /* lookup box with suggestions */
  const lkq = $("#lk-q"), sug = $("#lk-sug");
  let sugRows = [], sugI = -1;
  function suggest() {
    const q = lkq.value.trim().toLowerCase(); sugI = -1;
    if (q.length < 2) { sug.hidden = true; lkq.setAttribute("aria-expanded", "false"); return; }
    const qn = q.replace(/^0+/, "");
    sugRows = MAM.deals.filter(r => r.deal_no.replace(/^0+/, "").startsWith(qn) || r._txt.includes(q)).sort((a, b) => (b._ann || 0) - (a._ann || 0)).slice(0, 8);
    sug.innerHTML = sugRows.length ? sugRows.map((r, i) => '<li role="option" id="lks' + i + '" data-no="' + r.deal_no + '"><b>' + esc(MAM.tc(r.target)) + "</b><span>" + esc(MAM.tc(r.bidder)) + " · " + r.deal_no + (r.date_announced ? " · " + esc(r.date_announced) : "") + "</span></li>").join("") : '<li class="none">No deal matches “' + esc(lkq.value.trim()) + "”</li>";
    sug.hidden = false; lkq.setAttribute("aria-expanded", "true");
  }
  lkq.addEventListener("input", suggest);
  lkq.addEventListener("keydown", e => {
    if (sug.hidden || !sugRows.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sugI = (sugI + (e.key === "ArrowDown" ? 1 : -1) + sugRows.length) % sugRows.length; $$("li", sug).forEach((li, i) => li.classList.toggle("on", i === sugI)); lkq.setAttribute("aria-activedescendant", "lks" + sugI); }
    if (e.key === "Escape") sug.hidden = true;
  });
  sug.addEventListener("mousedown", e => { const li = e.target.closest("li[data-no]"); if (li) { e.preventDefault(); location.hash = "#deal/" + li.dataset.no; sug.hidden = true; } });
  lkq.addEventListener("blur", () => setTimeout(() => { sug.hidden = true; }, 150));
  $("#lk-form").addEventListener("submit", e => {
    e.preventDefault();
    if (sugI >= 0 && sugRows[sugI]) { location.hash = "#deal/" + sugRows[sugI].deal_no; return; }
    const q = lkq.value.trim(); if (!q) return;
    const qn = q.toLowerCase().replace(/^0+/, "");
    const exact = MAM.deals.find(r => r.deal_no.replace(/^0+/, "") === qn);
    if (exact) { location.hash = "#deal/" + exact.deal_no; return; }
    const hit = MAM.deals.filter(r => r._txt.includes(q.toLowerCase()));
    if (hit.length === 1) { location.hash = "#deal/" + hit[0].deal_no; return; }
    resetForm(); $("#tu-name").value = q; location.hash = "#results";
  });

  /* PDF download from any table */
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-pdf]"); if (!a) return;
    e.preventDefault(); MAM.downloadPdf(a.dataset.pdf);
  });
  MAM.downloadPdf = async function (no) {
    const r = MAM.byNo[no]; if (!r || !r.pdf) { MAM.toast("There is no PDF for this deal.", true); return; }
    const name = r.pdf.split("/").pop();
    const { data, error } = await MAM.sb.storage.from(MAM_CONFIG.pdfBucket).createSignedUrl(r.pdf, 120, { download: name });
    if (error || !data) { MAM.toast("Could not fetch the PDF: " + (error ? error.message : "unknown error"), true); return; }
    const a = document.createElement("a"); a.href = data.signedUrl; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
    MAM.log(no, "pdf");
  };

  /* ---------------- SEARCH FORM ---------------- */
  const form = $("#sform");
  MAM.buildChips(form);
  form.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => {
    form.querySelectorAll(".tabs button").forEach(x => { x.setAttribute("aria-selected", x === b ? "true" : "false"); $("#" + x.dataset.p).hidden = x !== b; });
  }));
  const chips = el => el ? [...el.querySelectorAll("label.chip")].filter(l => l.querySelector("input").checked).map(l => l.dataset.v) : [];
  const seg = n => { const r = form.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : ""; };
  const rid = (id, f = num) => { const a = document.getElementById(id), b = document.getElementById(id + "-b"); return [a ? f(a.value) : null, b ? f(b.value) : null]; };
  const on = r => r[0] != null || r[1] != null;
  const inR = (v, r) => { if (!on(r)) return true; if (v == null || v === "") return false; v = +v; return (r[0] == null || v >= r[0]) && (r[1] == null || v <= r[1]); };
  const msel = id => { const s = document.getElementById(id); if (!s) return []; const v = [...s.selectedOptions].map(o => o.value); return v.includes("") ? [] : v; };
  const pd = MAM.ukToTs;
  let formInit = false;
  function initForm() {
    if (formInit) return; formInit = true;
    const uniq = a => [...new Set(a.filter(Boolean).map(s => String(s).trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y));
    const opts = list => '<option value="" selected>All</option>' + list.map(x => '<option value="' + esc(x) + '">' + esc(x) + "</option>").join("");
    $("#tu-ctry").innerHTML = opts(uniq(MAM.deals.map(r => r.target_country)));
    $("#bd-ctry").innerHTML = opts(uniq(MAM.deals.map(r => r.bidder_country)));
    $("#dv-ctry").innerHTML = opts(uniq(MAM.deals.map(r => r.divestor_country)));
    $("#tu-sect").innerHTML = opts(uniq(MAM.deals.flatMap(r => String(r.sector || "").split(" / "))));
    $("#dp-type").innerHTML = '<option value="">-- Any --</option>' + uniq(MAM.deals.flatMap(r => String(r.deal_type || "").split(" / "))).map(t => '<option value="' + esc(t) + '">' + esc(t) + "</option>").join("");
    $$("[data-pdb-n]").forEach(e => e.textContent = MAM.statusDeals.length);
    $$("[data-pdb-asof]").forEach(e => e.textContent = MAM.statusAsOfText || "—");
  }
  function resetForm() {
    initForm();
    form.querySelectorAll("input").forEach(i => { if (i.type === "radio" || i.type === "checkbox") i.checked = i.defaultChecked; else i.value = ""; });
    form.querySelectorAll("select").forEach(s => [...s.options].forEach(o => o.selected = o.defaultSelected));
    live();
  }
  MAM.resetSearch = resetForm;
  const setChips = (id, vals) => $$("#" + id + " label.chip").forEach(l => { l.querySelector("input").checked = vals.includes(l.dataset.v); });
  const setSeg = (n, v) => { const r = form.querySelector('input[name="' + n + '"][value="' + v + '"]'); if (r) r.checked = true; };
  const PRESETS = {
    "pending-public": () => { setSeg("pub", "y"); setChips("dp-status", ["Pending"]); },
    "pending-private": () => { setSeg("pub", "n"); setChips("dp-status", ["Pending"]); },
    "uk-public": () => { setSeg("pub", "y"); setChips("dp-region", ["UK & Ireland"]); },
    "recent": () => { const d = new Date(Date.now() - 30 * 864e5); $("#dp-ann").value = d.toLocaleDateString("en-GB"); }
  };
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-preset]"); if (!b || !PRESETS[b.dataset.preset]) return;
    e.preventDefault(); resetForm(); PRESETS[b.dataset.preset](); live(); location.hash = "#results"; if (location.hash === "#results") MAM.hooks["show:results"]();
  });

  /* word search runs on the server against the full report text */
  const wsKey = () => ["ws-all", "ws-exact", "ws-or1", "ws-or2", "ws-or3", "ws-not"].map(i => $("#" + i).value.trim()).join("\u0001");
  let wsCache = { key: "", set: null }, wsPending = null;
  async function wordSet() {
    const k = wsKey(); if (!k.replace(/\u0001/g, "")) return null;
    if (wsCache.key === k) return wsCache.set;
    if (wsPending && wsPending.k === k) return wsPending.p;
    const p = (async () => {
      $("#ws-st").textContent = "Searching the report text…";
      const v = id => $("#" + id).value.trim() || null;
      const { data, error } = await MAM.sb.rpc("db_word_search", { p_all: v("ws-all"), p_phrase: v("ws-exact"), p_any: ["ws-or1", "ws-or2", "ws-or3"].map(v).filter(Boolean), p_not: v("ws-not") });
      if (error) { $("#ws-st").textContent = "Word search failed: " + error.message; return new Set(); }
      const set = new Set(data || []); wsCache = { key: k, set };
      $("#ws-st").textContent = set.size + " report" + (set.size === 1 ? "" : "s") + " match the words.";
      return set;
    })();
    wsPending = { k, p }; const s = await p; wsPending = null; return s;
  }

  async function readAndFilter() {
    initForm();
    const crit = [], C = (k, v) => crit.push([k, v]), f = [];
    /* Parties */
    const tn = $("#tu-name").value.trim().toLowerCase(); if (tn) { C("Target", tn); f.push(d => d.target.toLowerCase().includes(tn)); }
    const ta = $("#tu-act").value.trim().toLowerCase(); if (ta) { C("Activities", ta); f.push(d => String(d.activities || "").toLowerCase().includes(ta)); }
    const tc = msel("tu-ctry"); if (tc.length) { C("Target country", tc.join(", ")); f.push(d => tc.includes(d.target_country)); }
    const sc = msel("tu-sect"); if (sc.length) { C("Sector", sc.join(", ")); const ns = sc.map(norm); f.push(d => String(d.sector || "").split(" / ").some(x => ns.includes(norm(x)))); }
    const bn = $("#bd-name").value.trim().toLowerCase(); if (bn) { C("Bidder", bn); f.push(d => (d.bidder + " " + d.ultimate_bidder + " " + d.bidding_sub).toLowerCase().includes(bn)); }
    const bc = msel("bd-ctry"); if (bc.length) { C("Bidder country", bc.join(", ")); f.push(d => bc.includes(d.bidder_country)); }
    const dn = $("#dv-name").value.trim().toLowerCase(); if (dn) { C("Divestor", dn); f.push(d => String(d.divestor || "").toLowerCase().includes(dn)); }
    const dc = msel("dv-ctry"); if (dc.length) { C("Divestor country", dc.join(", ")); f.push(d => dc.includes(d.divestor_country)); }
    /* Deal parameters */
    const ty = $("#dp-type").value; if (ty) { C("Type", ty); f.push(d => String(d.deal_type).split(" / ").map(s => s.trim()).includes(ty)); }
    const adv = seg("adv"), la = $("#dp-la").value.trim().toLowerCase(), fa = $("#dp-fa").value.trim().toLowerCase();
    if (la) { C("Legal adviser", la); f.push(d => ((adv !== "t" ? d.adv_bl : "") + " " + (adv !== "b" ? d.adv_tl : "")).toLowerCase().includes(la)); }
    if (fa) { C("Financial adviser", fa); f.push(d => ((adv !== "t" ? d.adv_bf : "") + " " + (adv !== "b" ? d.adv_tf : "")).toLowerCase().includes(fa)); }
    const da = rid("dp-ann", pd); if (on(da)) { C("Announced", ($("#dp-ann").value || "…") + " – " + ($("#dp-ann-b").value || "…")); f.push(d => inR(d._ann, da)); }
    const dd = rid("dp-add", pd); if (on(dd)) { C("Added", ($("#dp-add").value || "…") + " – " + ($("#dp-add-b").value || "…")); f.push(d => inR(d._add, dd)); }
    const pb = seg("pub"); if (pb) { C(pb === "y" ? "Public deals" : "Private deals", "yes"); f.push(d => d.pub === (pb === "y")); }
    const xb = seg("xb"); if (xb) { C("Cross border", xb); f.push(d => d.cross_border === xb); }
    const ds = chips($("#dp-status")); if (ds.length) { C("Deal status", ds.join(", ")); f.push(d => ds.some(x => String(d.deal_status || "").toLowerCase().startsWith(x.toLowerCase()))); }
    const at = chips($("#dp-att")); if (at.length) { C("Attitude", at.join(", ")); const na = at.map(norm); f.push(d => na.includes(norm(d.attitude))); }
    const cs = chips($("#dp-cons")); if (cs.length) {
      C("Consideration", cs.join(", "));
      const kind = d => { const c = String(d.consideration || "").toLowerCase(); const cash = /cash/.test(c), sh = /share|stock|paper|unit/.test(c); return cash && sh ? "Cash and shares" : cash ? "Cash" : sh ? "Shares" : "Other / mixed"; };
      f.push(d => cs.includes(kind(d)));
    }
    const rg = chips($("#dp-region")); if (rg.length) { C("Region", rg.join(", ")); f.push(d => rg.includes(REGION[d.region])); }
    /* Deal value / financials (converted to the chosen currency at approximate rates) */
    const vc = seg("dvc") || "GBP", fc = seg("fnc") || "GBP";
    const conv = (v, ccy, want) => v == null ? null : MAM.fx(v, ccy || "GBP", want);
    [["dv-eq", "Equity value (" + vc + "m)", d => conv(d.equity_value, d.currency, vc)], ["dv-ev", "Enterprise value (" + vc + "m)", d => conv(d.enterprise_value, d.currency, vc)]]
      .forEach(([id, l, g]) => { const r = rid(id); if (on(r)) { C(l, (r[0] ?? "") + "–" + (r[1] ?? "")); f.push(d => inR(g(d), r)); } });
    { const r = rid("dv-prem"); if (on(r)) { C("Pre-bid premium %", (r[0] ?? "") + "–" + (r[1] ?? "")); f.push(d => inR(d.premium, r)); } }
    { const r = rid("dv-bid"); if (on(r)) { C("% bid for", (r[0] ?? "") + "–" + (r[1] ?? "")); f.push(d => inR(d.pct_bid_for, r)); } }
    [["fn-sales", "Turnover (" + fc + "m)", d => conv(d.sales, d.currency, fc)], ["fn-ebitda", "EBITDA (" + fc + "m)", d => conv(d.ebitda, d.currency, fc)], ["fn-ni", "Net income (" + fc + "m)", d => conv(d.net_income, d.currency, fc)],
     ["fn-evs", "EV/Sales", d => d.ev_sales], ["fn-evebitda", "EV/EBITDA", d => d.ev_ebitda], ["fn-pe", "P/E", d => d.pe], ["fn-pb", "P/B", d => d.pb]]
      .forEach(([id, l, g]) => { const r = rid(id); if (on(r)) { C(l, (r[0] ?? "") + "–" + (r[1] ?? "")); f.push(d => inR(g(d), r)); } });
    /* Word search (server) */
    const ws = await wordSet(); if (ws) { C("Words", wsKey().split("\u0001").filter(Boolean).join(" · ")); f.push(d => ws.has(d.deal_no)); } else $("#ws-st").textContent = "";
    /* Offer status (pending-offers database) */
    const st = chips($("#pdb-struct")); if (st.length) { C("Structure", st.join(", ")); f.push(d => st.includes(d.offer_structure)); }
    const cu = chips($("#pdb-cstat")); if (cu.length) { C("Current status", cu.join(", ")); f.push(d => d.has_status && cu.some(x => String(d.current_status || "").startsWith(x.split(" - ")[0]))); }
    const re = chips($("#pdb-regime")); if (re.length) { C("Regime", re.join(", ")); f.push(d => re.includes(d.regime)); }
    const cp = chips($("#pdb-comp")); if (cp.length) { C("Competitive status", cp.join(", ")); f.push(d => cp.includes(d.competitive_status)); }
    const rr = chips($("#pdb-rref")); if (rr.length) { C("Phase 2 referral", rr.join(", ")); f.push(d => d.has_status && rr.some(x => { const rep = norm(d.regulatory_referral), s = d.regulatory_status;
      if (x === "No referral") return rep === "noreferral" && s !== "Phase 2 referral - pending";
      if (x === "Pending") return rep === "pending" || s === "Phase 2 referral - pending";
      return rep === norm(x) || s === x; })); }
    const rs = chips($("#pdb-rstat")); if (rs.length) { C("Clearance status", rs.join(", ")); f.push(d => rs.includes(d.regulatory_status)); }
    [["pdb-ex", "pct_existing_stake", "% existing stake"], ["pdb-spa", "pct_spa", "% SPA"], ["pdb-irr", "pct_irrevocables", "% irrevocables"], ["pdb-tot", "pct_agreed_total", "% agreed"], ["pdb-thr", "acceptance_threshold_pct", "Threshold %"], ["pdb-acc", "acceptances_pct", "Acceptances %"]]
      .forEach(([id, k, l]) => { const r = rid(id); if (on(r)) { C(l, (r[0] ?? "") + "–" + (r[1] ?? "")); f.push(d => inR(d[k], r)); } });
    const nt = seg("pdb-nothr"); if (nt) { C("No minimum threshold", nt === "y" ? "Yes" : "No"); f.push(d => { if (!d.has_status) return false; const none = d.acceptance_threshold_pct == null && /no minimum/i.test(d.acceptance_threshold_text || ""); return nt === "y" ? none : !none; }); }
    const ha = seg("pdb-hasacc"); if (ha) { C("Acceptances published", ha === "y" ? "Yes" : "No"); f.push(d => d.has_status && (ha === "y" ? has(d.acceptances_pct) : !has(d.acceptances_pct))); }
    [["pdb-ops", "acceptance_period_start", "Offer period start"], ["pdb-ope", "acceptance_period_end_current", "Offer period end"], ["pdb-mtg", "shareholder_meeting_date", "Meeting"]]
      .forEach(([id, k, l]) => { const r = rid(id, pd); if (on(r)) { C(l, ($("#" + id).value || "…") + " – " + ($("#" + id + "-b").value || "…")); f.push(d => inR(pd(d[k]), r)); } });
    const hk = seg("pdb-hask"); if (hk) { C("Key date announced", hk === "y" ? "Yes" : "No"); f.push(d => { if (!d.has_status) return false; const k = has(d.acceptance_period_end_current) || has(d.shareholder_meeting_date); return hk === "y" ? k : !k; }); }
    [["pdb-ext", "offer_period_extended", "Offer period extended"], ["pdb-low", "acceptance_threshold_lowered", "Threshold lowered"], ["pdb-sq", "squeeze_out", "Squeeze-out"]]
      .forEach(([n, k, l]) => { const v = seg(n); if (v) { C(l, v); f.push(d => d.has_status && (v === "Yes" ? d[k] === "Yes" : d[k] !== "Yes")); } });
    /* Country specific: any criterion in a box restricts to that regime */
    const box = (reg, tests) => { const act = tests.filter(Boolean); if (act.length) { C(reg, act.length + " field" + (act.length > 1 ? "s" : "")); f.push(d => d.regime === reg && act.every(t => t(d))); } };
    const yn = (n, k) => { const v = seg(n); return v ? (d => v === "y" ? has(d[k]) : !has(d[k])) : null; };
    const dr = (id, k) => { const r = rid(id, pd); return on(r) ? (d => inR(pd(d[k]), r)) : null; };
    const nr = (id, k) => { const r = rid(id); return on(r) ? (d => inR(d[k], r)) : null; };
    const ch = (id, k, map) => { const v = chips($("#" + id)); return v.length ? (d => v.some(x => map ? map(x, d[k]) : d[k] === x)) : null; };
    box("France", [yn("pdb-fr-amf", "fr_amf_clearance_date"), dr("pdb-fr-amfd", "fr_amf_clearance_date"), nr("pdb-fr-up", "fr_pct_acquired_upfront"), yn("pdb-fr-upc", "fr_upfront_purchase_completed_date"), ch("pdb-fr-exp", "fr_independent_expert_conclusion", (x, v) => x === "Not yet issued" ? !has(v) : v === x)]);
    box("Italy", [ch("pdb-it-gp", "it_golden_power"), yn("pdb-it-cs", "it_consob_approval_date"), dr("pdb-it-csd", "it_consob_approval_date")]);
    box("Germany", [yn("pdb-de-bf", "de_bafin_approval_date"), dr("pdb-de-bfd", "de_bafin_approval_date"), yn("pdb-de-cl", "de_offer_period_closed_date")]);
    box("Spain", [yn("pdb-es-cn", "es_cnmv_approval_date"), dr("pdb-es-cnd", "es_cnmv_approval_date")]);
    box("Netherlands", [yn("pdb-nl-afm", "nl_afm_approval_date"), dr("pdb-nl-afmd", "nl_afm_approval_date")]);
    box("Belgium", [yn("pdb-be-fs", "be_fsma_approval_date"), dr("pdb-be-fsd", "be_fsma_approval_date")]);
    box("United States", [ch("pdb-us-type", "us_public_type"), nr("pdb-us-bf", "us_break_fee_usd_m"), nr("pdb-us-rbf", "us_reverse_break_fee_usd_m")]);
    return { rows: MAM.deals.filter(d => f.every(t => t(d))), crit };
  }

  let lt, seq = 0;
  function live() {
    clearTimeout(lt);
    lt = setTimeout(async () => {
      const my = ++seq; const r = await readAndFilter(); if (my !== seq) return;
      MAM.odo($("#s-odo"), r.rows.length);
      $("#s-crit-n").textContent = r.crit.length ? r.crit.length + " criteri" + (r.crit.length === 1 ? "on" : "a") + " set" : "No criteria set: every deal on the DataBase";
      $$(".pdb-c").forEach(b => b.classList.toggle("on", [...b.querySelectorAll("input")].some(i => i.type === "radio" ? (i.checked && i.value !== "") : i.type === "checkbox" ? i.checked : i.value.trim() !== "")));
    }, 160);
  }
  form.addEventListener("input", live); form.addEventListener("change", live);
  $("#s-new").addEventListener("click", resetForm);
  MAM.hooks["show:search"] = () => { initForm(); live(); };

  /* ---------------- RESULTS ---------------- */
  const SHORT = { "Scheme of arrangement": "Scheme", "Takeover/tender offer": "Offer", "US one-step merger": "US merger", "US tender offer (two-step)": "US tender", "Statutory/cross-border merger": "Merger", "Other": "Other" };
  const RGC = { "Awaiting regulatory clearance": ["rg-aw", "Awaiting"], "All regulatory clearances obtained": ["rg-ok", "All obtained"], "No regulatory clearance required": ["rg-no", "None required"], "Phase 2 referral - pending": ["rg-p2", "Phase 2 pending"], "Referred and cleared": ["rg-ok", "Ref. & cleared"], "Conditions imposed": ["rg-aw", "Conditions"], "Referred and failed": ["rg-p2", "Ref. & failed"] };
  const today = (() => { const n = new Date(); return +new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();
  function keyDate(d) {
    if (has(d.acceptance_period_end_current)) { const t = pd(d.acceptance_period_end_current); return { t, s: d.acceptance_period_end_current, l: t < today ? "Offer period closed" : "Offer period closes" }; }
    if (has(d.shareholder_meeting_date)) { const t = pd(d.shareholder_meeting_date); return { t, s: d.shareholder_meeting_date, l: t < today ? "Meeting held" : "Shareholder meeting" }; }
    if (has(d.acceptance_period_start)) { const t = pd(d.acceptance_period_start); return { t, s: d.acceptance_period_start, l: "Offer period opens" }; }
    return { t: null, s: "", l: "" };
  }
  const thrTxt = d => d.acceptance_threshold_pct != null ? pct(d.acceptance_threshold_pct) : (/no minimum/i.test(d.acceptance_threshold_text || "") ? "None" : "—");
  const money = (v, ccy) => v == null ? '<span class="muted">—</span>' : '<span class="num">' + nf(v, v >= 100 ? 0 : 1) + "</span>" + (ccy ? ' <small class="muted">' + esc(ccy === "STG" ? "£" : ccy) + "</small>" : "");
  let cur = [], crit = [], sortK = "_ann", sortD = -1, shown = 100, view = "deal", userView = false;
  const COLS = {
    deal: [["Nr.", "r", null], ["Target", "sort", "target"], ["Bidder", "sort", "bidder"], ["Deal no", "sort", "deal_no"], ["Ann. date", "sort", "_ann"], ["Country", "sort", "target_country"], ["Deal type", "sort", "deal_type"], ["Status", "sort", "deal_status"], ["Value (m)", "sort r", "equity_value"], ["Equity £m", "sort r", "equity_value_gbp"], ["Report", "", null], ['<input type="checkbox" id="pdb-all" checked aria-label="Select all">', "c", null]],
    status: [["Nr.", "r", null], ["Target", "sort", "target"], ["Bidder", "sort", "bidder"], ["Deal no", "sort", "deal_no"], ["Ann. date", "sort", "_ann"], ["Regime", "sort", "regime"], ["Structure", "sort", "offer_structure"], ["Status", "sort", "current_status"], ["% agreed", "sort r", "pct_agreed_total"], ["Threshold", "sort r", "acceptance_threshold_pct"], ["Key date", "sort", "_kd"], ["Regulatory", "sort", "regulatory_status"], ["Accept.", "sort r", "acceptances_pct"], ["Report", "", null], ['<input type="checkbox" id="pdb-all" checked aria-label="Select all">', "c", null]]
  };
  const sel = new Set();
  function render() {
    cur.forEach(d => { d._kd = keyDate(d).t; });
    const rows = [...cur].sort((a, b) => { let x = a[sortK], y = b[sortK]; const nx = x == null || x === "", ny = y == null || y === ""; if (nx && ny) return 0; if (nx) return 1; if (ny) return -1; if (typeof x === "string") return x.localeCompare(y) * sortD; return (x - y) * sortD; });
    const cols = COLS[view];
    const thd = "<thead><tr>" + cols.map(c => '<th class="' + c[1] + (c[2] === sortK ? " so" + (sortD > 0 ? " asc" : "") : "") + '"' + (c[2] ? ' data-k="' + c[2] + '"' : "") + ">" + c[0] + "</th>").join("") + "</tr></thead>";
    const bar = v => v == null ? "" : '<span class="bar"><i style="width:' + Math.max(0, Math.min(100, v)) + '%"></i></span>';
    const rep = d => '<div class="ibs">' + (d.has_report ? '<a class="ib" href="#deal/' + d.deal_no + '" title="Open the full deal report">' + ICON.view + "</a>" : '<span class="ib off" title="No report on this site yet">' + ICON.view + "</span>") + (d.pdf ? '<a class="ib" href="#" data-pdf="' + d.deal_no + '" title="Download the PDF report">' + ICON.pdf + "</a>" : "") + '<a class="ib" href="#" data-csv="' + d.deal_no + '" title="Export this deal (CSV)">' + ICON.dl + "</a></div>";
    const selc = d => '<td class="c"><input type="checkbox" data-sel="' + d.deal_no + '"' + (sel.has(d.deal_no) ? " checked" : "") + ' aria-label="Select deal ' + d.deal_no + '" style="accent-color:var(--a)"></td>';
    const body = rows.slice(0, shown).map((d, i) => {
      const lead = '<tr class="pdb-row" data-dno="' + d.deal_no + '"><td class="r"><span class="dt">' + (i + 1) + '</span></td><td class="nm" title="' + esc(d.target) + '">' + esc(trunc(d.target, 30)) + '</td><td title="' + esc((d.bidding_sub ? d.bidding_sub + " / " : "") + d.bidder) + '">' + esc(trunc(d.bidder, 28)) + '</td><td><a class="dno" href="#deal/' + d.deal_no + '">' + d.deal_no + '</a></td><td><span class="dt">' + esc(d.date_announced || "—") + "</span></td>";
      if (view === "deal") {
        return lead + "<td>" + esc(d.target_country || "—") + '</td><td title="' + esc(d.deal_type) + '">' + esc(trunc(d.deal_type, 26) || "—") + '</td><td><span class="stat stat-' + esc((d.deal_status || "Pending").split(" ")[0]) + '">' + esc(d.deal_status || "—") + '</span></td><td class="r">' + money(d.equity_value, d.currency) + '</td><td class="r">' + (d.equity_value_gbp == null ? '<span class="muted">—</span>' : '<span class="num">' + nf(d.equity_value_gbp, d.equity_value_gbp >= 100 ? 0 : 1) + "</span>") + "</td><td>" + rep(d) + "</td>" + selc(d) + "</tr>";
      }
      if (!d.has_status) return lead + '<td colspan="8" class="muted" style="font-size:11.5px">No offer-status record (' + (d.pub ? "public" : "private") + " deal · " + esc(d.deal_status || "—") + ")</td><td>" + rep(d) + "</td>" + selc(d) + "</tr>";
      const k = keyDate(d), stc = /^Unconditional/.test(d.current_status || "") ? "Unconditional" : (d.current_status || "Pending"), rg = RGC[d.regulatory_status];
      return lead + "<td>" + esc(d.regime || "—") + '</td><td title="' + esc(d.offer_structure) + '">' + esc(SHORT[d.offer_structure] || d.offer_structure || "—") + '</td><td><span class="stat stat-' + esc(stc.split(" ")[0]) + '" title="' + esc(d.current_status_note || "") + '">' + esc(stc) + '</span></td><td class="pc" title="' + esc("Stake " + pct(d.pct_existing_stake) + " · SPA " + pct(d.pct_spa) + " · Irrevocables/LOIs " + pct(d.pct_irrevocables)) + '">' + pct(d.pct_agreed_total) + bar(d.pct_agreed_total) + '</td><td class="pc" title="' + esc(d.acceptance_threshold_text || "") + '">' + thrTxt(d) + '</td><td class="kd">' + (k.s ? '<span class="dt">' + esc(k.s) + "</span><small>" + k.l + "</small>" : '<span class="muted">—</span>') + '</td><td title="' + esc(d.regulatory_detail || "") + '">' + (rg ? '<span class="pdtg ' + rg[0] + '">' + rg[1] + "</span>" : '<span class="muted">—</span>') + '</td><td class="pc" title="' + esc((d.acceptances_date ? "At " + d.acceptances_date + ". " : "") + (d.acceptances_note || "")) + '">' + (d.acceptances_pct == null || d.acceptances_pct === "" ? '<span class="muted">—</span>' : pct(d.acceptances_pct)) + "</td><td>" + rep(d) + "</td>" + selc(d) + "</tr>";
    }).join("");
    $("#t-results").innerHTML = thd + "<tbody>" + (body || '<tr><td colspan="' + cols.length + '"><div class="pdb-empty">No deals match these criteria. <a href="#search">Back to Search Criteria</a></div></td></tr>') + "</tbody>";
    const all = $("#pdb-all"); if (all) all.checked = cur.length > 0 && cur.every(d => sel.has(d.deal_no));
    MAM.odo($("#r-odo"), cur.length);
    $("#pdb-rows").textContent = cur.length ? "1–" + Math.min(shown, cur.length) + " of " + cur.length : "0";
    $("#r-more").hidden = shown >= cur.length;
    const cr = $("#pdb-crit"); cr.hidden = !crit.length; cr.innerHTML = "<span>Criteria:</span>" + crit.map(c => '<span class="k">' + esc(c[0]) + (c[1] === "yes" ? "" : ": " + esc(c[1])) + "</span>").join("");
    $$('#r-view input').forEach(i => { i.checked = i.value === view; });
  }
  async function runSearch() {
    $("#t-results").innerHTML = '<tbody><tr><td><div class="pdb-empty">Searching…</div></td></tr></tbody>';
    const r = await readAndFilter(); cur = r.rows; crit = r.crit; shown = 100;
    sel.clear(); cur.forEach(d => sel.add(d.deal_no));
    if (!userView) view = cur.length && cur.every(d => d.has_status) ? "status" : "deal";
    render();
  }
  MAM.hooks["show:results"] = () => { initForm(); runSearch(); };
  $("#r-view").addEventListener("change", e => { view = e.target.value; userView = true; render(); });
  $("#r-more").addEventListener("click", () => { shown += 100; render(); });
  $("#t-results").addEventListener("click", e => {
    const thx = e.target.closest("th[data-k]"); if (thx) { const k = thx.dataset.k; if (k === sortK) sortD = -sortD; else { sortK = k; sortD = ["_ann", "pct_agreed_total", "acceptances_pct", "acceptance_threshold_pct", "equity_value", "equity_value_gbp"].includes(k) ? -1 : 1; } render(); return; }
    if (e.target.id === "pdb-all") { cur.forEach(d => e.target.checked ? sel.add(d.deal_no) : sel.delete(d.deal_no)); render(); return; }
    const sb = e.target.closest("[data-sel]"); if (sb) { sb.checked ? sel.add(sb.dataset.sel) : sel.delete(sb.dataset.sel); return; }
    const c = e.target.closest("[data-csv]"); if (c) { e.preventDefault(); download([MAM.byNo[c.dataset.csv]], "deal_" + c.dataset.csv + ".csv", "deal"); MAM.log(c.dataset.csv, "csv"); return; }
    if (e.target.closest("a,input,button")) return;
    const tr = e.target.closest("tr.pdb-row"); if (tr && MAM.byNo[tr.dataset.dno] && MAM.byNo[tr.dataset.dno].has_report) location.hash = "#deal/" + tr.dataset.dno;
  });

  /* downloads */
  const DEAL_COLS = [["Deal No", "deal_no"], ["Target", "target"], ["Target Country", "target_country"], ["Bidder", "bidder"], ["Ultimate Bidder", "ultimate_bidder"], ["Bidding Subsidiary", "bidding_sub"], ["Bidder Country", "bidder_country"], ["Divestor", "divestor"], ["Divestor Country", "divestor_country"],
    ["Sector", "sector"], ["Target Activities", "activities"], ["Stock Exchange Index", "stock_index"], ["Deal Type", "deal_type"], ["Public", d => d.pub ? "Yes" : "No"], ["Deal Status", "deal_status"], ["Date Announced", "date_announced"], ["Attitude", "attitude"], ["Consideration", "consideration"], ["Cross Border", "cross_border"],
    ["Currency", d => d.currency === "STG" ? "GBP" : d.currency], ["Offer Price", "offer_price"], ["Total Equity Value (m)", "equity_value"], ["Enterprise Value (m)", "enterprise_value"], ["Total Equity Value (GBP m, approx.)", d => d.equity_value_gbp == null ? "" : Math.round(d.equity_value_gbp * 10) / 10],
    ["Pre-bid Speculation Premium %", "premium"], ["EV/Sales", "ev_sales"], ["EV/EBITDA", "ev_ebitda"], ["Price/Earnings", "pe"], ["Price/Book", "pb"], ["Turnover (m)", "sales"], ["EBITDA (m)", "ebitda"], ["Net Income (m)", "net_income"],
    ["Bidder Financial Adviser", "adv_bf"], ["Bidder Legal Adviser", "adv_bl"], ["Target/Divestor Financial Adviser", "adv_tf"], ["Target/Divestor Legal Adviser", "adv_tl"]];
  const STATUS_SKIP = new Set(["deal_no", "target", "bidder"]);
  function download(rows, name, kind) {
    if (kind === "status") {
      const cols = [["Deal No", "deal_no"], ["Target", "target"], ["Bidder", "bidder"]].concat(((MAM.statusCols || []).filter(c => !STATUS_SKIP.has(c[2]) && c[0] !== "QA")).map(c => [c[1], c[2]]));
      MAM.csv(cols, rows.filter(d => d.has_status), name);
    } else MAM.csv(DEAL_COLS, rows, name);
  }
  $("#r-dl").addEventListener("click", () => {
    const kind = (document.querySelector('input[name="dlt"]:checked') || {}).value || "deal";
    const rows = cur.filter(d => sel.has(d.deal_no));
    if (!rows.length) { MAM.toast("Select at least one deal to download.", true); return; }
    if (kind === "status" && !rows.some(d => d.has_status)) { MAM.toast("None of the selected deals has an offer-status record.", true); return; }
    download(rows, (kind === "status" ? "offer_status_" : "deals_") + new Date().toISOString().slice(0, 10) + ".csv", kind);
  });
})();
